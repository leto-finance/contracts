const { web3 } = require('@openzeppelin/test-helpers/src/setup')
const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')

// Contracts
const LetoPriceConsumer = artifacts.require("LetoPriceConsumer")
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter")
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter")
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter")
const LetoRegistry = artifacts.require("LetoRegistry")
const LetoDeployer = artifacts.require("LetoDeployer")
const LetoToken = artifacts.require("LetoToken")
const LetoPool = artifacts.require("LetoPool")
const WETH9 = artifacts.require("WETH9")

// Mocks
const LetoTokenMock = artifacts.require("LetoTokenMock")
const AggregatorV3Mock = artifacts.require("AggregatorV3Mock")

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const PRICE_FEED = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"
const AAVE_INTEREST_BEARING_USDC = "0xBcca60bB61934080951369a648Fb03DF4F96263C"
const AAVE_DEBT_BEARING_STABLE_USDC = "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6"
const AAVE_INTEREST_BEARING_WETH = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e"
const AAVE_DEBT_BEARING_STABLE_WETH = "0x4e977830ba4bd783C0BB7F15d3e243f73FF57121"

async function getDeployedContracts() {
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoUniswapAdapter.deployed()
	const strategyAdapter = await LetoLongStrategyAdapter.deployed()

	return {
		registry,
		deployer,
		lendingMarketAdapter,
		exchangeAdapter,
		strategyAdapter,
	}
}

contract("LetoLongStrategy", accounts => {
	let rate;

	it("should calculate pool token price according to strategy", async () => {
		const { BN } = web3.utils
		const [poolOwner] = accounts
		const { registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts();

		const contract = require('@truffle/contract')

		const weth9 = await WETH9.at(WETHAddress)

		for (let i = 0; i <= 3; i++) {
			await weth9.deposit({
				from: accounts[i],
				value: web3.utils.toWei("10", "ether")
			});
		}

		WETH = await LetoToken.at(WETHAddress)
		USDC = await LetoToken.at(USDCAddress)

		const poolToken = await LetoTokenMock.new("L-ETHup", "L-ETHup", 24)
		await poolToken.transferOwnership(deployer.address)

		await registry.setAddress("PriceFeed:L-ETHup", PRICE_FEED, { from: poolOwner })

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const decimals0 = (new BN(10)).pow(await WETH.decimals())
		const decimals1 = (new BN(10)).pow(await USDC.decimals())

		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, 1])).substr(26)

		const priceConsumer = await LetoPriceConsumer.new()

		const latestPairPrice = await priceConsumer.getPrice.call(PRICE_FEED)
		rate = (new BN(10)).pow(new BN(22)).div(latestPairPrice) // 100 USD for 1 L-ETHup at a 1 ETH = 3153 USD
		const initialDeposit = ((new BN(10)).pow(new BN(24))).div(rate).mul(new BN(100)); // 10000 USD

		console.log("INITIAL DEPOSIT: ", initialDeposit.toString())

		await WETH.transfer(deployer.address, initialDeposit, { from: poolOwner })

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			WETH.address, USDC.address,
			20000, // decimals 4
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await deployer.deployPool(...deployArgs, { from: poolOwner })

		pool = await LetoPool.at(poolAddress)

		let poolState = await strategyAdapter.poolState.call(poolAddress)

		console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
		console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())

		console.log("Rate", poolState.parameters.rate)
		console.log("WETH Balance", poolState.balance0)
		console.log("USDC Balance", poolState.balance1)
		console.log("deposited", poolState.deposited)
		console.log("borrowed", poolState.borrowed)
		console.log("netValue", poolState.netValue)
		console.log("leverage", poolState.leverage)

		assert.equal(poolState.balance0, initialDeposit.toString())
		assert.equal(poolState.balance1, "0")
		assert.equal(poolState.deposited, initialDeposit.toString())
		assert.equal(poolState.borrowed, "0")
		assert.equal(poolState.netValue, initialDeposit.toString())
		assert.equal(poolState.leverage, "10000")
		assert.equal(poolState.parameters.target_leverage, "20000")

		assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(lendingMarketAdapter.address)).toString(), "0")

		assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
		assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(lendingMarketAdapter.address)).toString(), "0")

		assert.equal((await pool.calculateMaxWithdrawal.call()).toString(), "0")

		assert.equal((await lendingMarketAdapter.availableBorrows.call(pool.address)).toString(), "0")

		for (let i = 0; i < 2; i++) {
			console.log(`\n Rebalancing ${i} \n`)

			await strategyAdapter.rebalance(poolAddress,
				await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress),
				await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)
			)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())

			console.log("Rate", poolState.parameters.rate)
			console.log("WETH Balance", poolState.balance0)
			console.log("USDC Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)

			assert.equal(poolState.balance0, "0")
			assert.equal(poolState.balance1, "0")
			assert.equal(poolState.deposited, new BN(poolState.borrowed).add(new BN(poolState.netValue)).toString())
	
			assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString(), "0")
			assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).div(decimals1).toString(), ((new BN(poolState.borrowed)).mul(decimals0.mul(decimals0).div(latestPairPrice))).div((new BN(10)).pow(new BN(36))).toString())
			assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
			assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
	
			assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString(), poolState.deposited)
			assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString(), "0")
			assert.equal((await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
			assert.equal((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(lendingMarketAdapter.address)).toString(), "0")
		}

		for (let i = 0; i < 3; i++) {
			const { lendingMarketAdapter } = await getDeployedContracts();
			const depoitAmount = (((new BN(10)).pow(new BN(25))).div(rate)).mul(new BN(10)) // 10000 USD

			await WETH.approve(pool.address, depoitAmount, { from: accounts[i + 1] })
			await pool.deposit(depoitAmount, { from: accounts[i + 1] })

			console.log(`\n Deposit ${i} \n`)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
	
			console.log("Rate", poolState.parameters.rate)
			console.log("WETH Balance", poolState.balance0)
			console.log("USDC Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
		}

		for (let i = 0; i < 1; i++) {
			const { lendingMarketAdapter } = await getDeployedContracts();
			await strategyAdapter.rebalance(poolAddress, 0, 0)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
	
			console.log("Rate", poolState.parameters.rate)
			console.log("WETH Balance", poolState.balance0)
			console.log("USDC Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
		}

		for (let i = 0; i < 3; i++) {
			const { lendingMarketAdapter } = await getDeployedContracts();
			let withdrawalAmount = (await poolToken.balanceOf(accounts[i])).div(new BN(2))
			
			// 75 % of the pool Net Value is the maximum amount, that User can withdraw in a single transaction, if the LVL pool is perfectly balanced.If the LVL pool is unbalanced the MAX amount of withdrawal would be determined by the formula:

			// MAX Withdrawal = Current Value of Deposited Assets – (Current Value of Borrowed Assets / MAX LTV)
			
			// let withdrawalAmount = (await poolToken.balanceOf(accounts[i]))
			// let maxWithdrawal = (await pool.calculateMaxWithdrawal.call()).mul(rate)

			// console.log("MaxWithdrawal: ", maxWithdrawal.toString());

			// if (withdrawalAmount.cmp(maxWithdrawal) == 1) {
			// 	withdrawalAmount = maxWithdrawal.sub(decimalsPool)
			// }

			console.log(`\n Withdrawal ${i}, amount: ${withdrawalAmount} \n`)

			console.log(`WETH Balance of account before withdrawal: ${i}`, (await WETH.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account before withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			await poolToken.approve(pool.address, withdrawalAmount, { from: accounts[i] })
			await pool.redeem(withdrawalAmount, { from: accounts[i] })

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`WETH Balance of account after withdrawal: ${i}`, (await WETH.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account after withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())

			console.log("Rate", poolState.parameters.rate)
			console.log("WETH Balance", poolState.balance0)
			console.log("USDC Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
		}

		for (let i = 0; i < 1; i++) {
			const { lendingMarketAdapter } = await getDeployedContracts();

			await strategyAdapter.rebalance(poolAddress, 0, 0)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

		console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
		console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())

		console.log("Rate", poolState.parameters.rate)
		console.log("WETH Balance", poolState.balance0)
		console.log("USDC Balance", poolState.balance1)
		console.log("deposited", poolState.deposited)
		console.log("borrowed", poolState.borrowed)
		console.log("netValue", poolState.netValue)
		console.log("leverage", poolState.leverage)
		}
	})
})
