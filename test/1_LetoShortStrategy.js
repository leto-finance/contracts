const SwapRouterJSON = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json')

const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')

// Contracts
const LetoPriceConsumer = artifacts.require("LetoPriceConsumer")
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter")
const LetoShortStrategyAdapter = artifacts.require("LetoShortStrategyAdapter")
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter")
const LetoRegistry = artifacts.require("LetoRegistry")
const LetoDeployer = artifacts.require("LetoDeployer")
const LetoToken = artifacts.require("LetoToken")
const LetoPool = artifacts.require("LetoPool")

// Mocks
const LetoTokenMock = artifacts.require("LetoTokenMock")
const AggregatorV3Mock = artifacts.require("AggregatorV3Mock")

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const PRICE_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
const AAVE_INTEREST_BEARING_USDC = "0xBcca60bB61934080951369a648Fb03DF4F96263C"
const AAVE_DEBT_BEARING_STABLE_USDC = "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6"
const AAVE_INTEREST_BEARING_WETH = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e"
const AAVE_DEBT_BEARING_STABLE_WETH = "0x4e977830ba4bd783C0BB7F15d3e243f73FF57121"

async function getDeployedContracts() {
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoUniswapAdapter.deployed()
	const strategyAdapter = await LetoShortStrategyAdapter.deployed()

	return {
		registry,
		deployer,
		lendingMarketAdapter,
		exchangeAdapter,
		strategyAdapter,
	}
}

contract("LetoShortStrategy", accounts => {
	it("should calculate pool token price according to strategy", async () => {
		const { BN } = web3.utils
		const [poolOwner] = accounts
		const { registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts();

		const contract = require('@truffle/contract')

		const swapRouterContract = contract({ abi: SwapRouterJSON.abi, unlinked_binary: SwapRouterJSON.bytecode })
		swapRouterContract.setProvider(web3.currentProvider)
		const swapRouter = await swapRouterContract.at(SWAP_ROUTER)

		for (let i = 0; i < 3; i++) {
			await swapRouter.exactInputSingle(
				{
					tokenIn: WETHAddress,
					tokenOut: USDCAddress,
					fee: 3000,
					recipient: accounts[i],
					deadline: Math.round((new Date()).getTime() / 10 ** 3) + 1000,
					amountIn: web3.utils.toWei("10", "ether"),
					amountOutMinimum: 0,
					sqrtPriceLimitX96: 0,
				}, {
					from: poolOwner,
					value: web3.utils.toWei("10", "ether")
				}
			);
		}

		USDC = await LetoToken.at(USDCAddress)
		WETH = await LetoToken.at(WETHAddress)

		const rate = 10000000000 // 100 USDC for 1 L-ETHdown

		const poolToken = await LetoTokenMock.new("L-ETHdown", "L-ETHdown", 6)
		await poolToken.transferOwnership(deployer.address)

		await registry.setAddress("PriceFeed:L-ETHdown", PRICE_FEED, { from: poolOwner })

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const USDCDecimals = (new BN(10)).pow(await USDC.decimals())

		const initialDeposit = (new BN(10000)).mul(USDCDecimals) // 10000 USDC = 10 L-ETHdown

		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, 1])).substr(26)
		await USDC.transfer(deployer.address, initialDeposit, { from: poolOwner })

		assert.equal(
			(await USDC.balanceOf.call(deployer.address, { from: poolOwner })).toString(),
			initialDeposit.toString()
		)

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			USDC.address, WETH.address,
			20000, // decimals 4
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await deployer.deployPool(...deployArgs, { from: poolOwner })

		pool = await LetoPool.at(poolAddress)

		console.log("Initial state")

		let poolState = await strategyAdapter.poolState.call(poolAddress)

		console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
		console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
		console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
		console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

		console.log("USDC Balance", poolState.balance0)
		console.log("WETH Balance", poolState.balance1)
		console.log("deposited", poolState.deposited)
		console.log("borrowed", poolState.borrowed)
		console.log("netValue", poolState.netValue)
		console.log("leverage", poolState.leverage)
		console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
		console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
		console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		// console.log("calculateRebalancingAmount", (await strategyAdapter.calculateRebalancingAmount.call(new BN(poolState.deposited), new BN(poolState.netValue), new BN(poolState.parameters.target_leverage))).toString())

		for (let i = 0; i < 2; i++) {
			console.log(`\n Rebalancing ${i} \n`)

			await strategyAdapter.rebalance(poolAddress, 0, 0)

			console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			console.log((await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log((await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log((await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
			// console.log("calculateRebalancingAmount", (await strategyAdapter.calculateRebalancingAmount.call(new BN(poolState.deposited), new BN(poolState.netValue), new BN(poolState.parameters.target_leverage))).toString())
		}

		for (let i = 1; i < 3; i++) {
			const depoitAmount = (new BN(1000)).mul(USDCDecimals) // 1.000 USDC
			await USDC.approve(pool.address, depoitAmount, { from: accounts[i] })
			await pool.deposit(depoitAmount, { from: accounts[i] })

			console.log(`\n Deposit ${i} \n`)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			console.log(`L-ETHup Balance of account: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())
			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 0; i < 1; i++) {
			await strategyAdapter.rebalance(poolAddress, 0, 0)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

			console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 1; i < 3; i++) {
			const { lendingMarketAdapter } = await getDeployedContracts();
			let withdrawalAmount = (await poolToken.balanceOf(accounts[i]))

			console.log(`\n Withdrawal ${i} \n`)

			console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			console.log(`USDC Balance of account before withdrawal: ${i}`, (await USDC.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account before withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			await poolToken.approve(pool.address, withdrawalAmount, { from: accounts[i] })
			await pool.redeem(withdrawalAmount, { from: accounts[i] })

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`USDC Balance of account after withdrawal: ${i}`, (await USDC.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account after withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}


		for (let i = 0; i < 1; i++) {
			await strategyAdapter.rebalance(poolAddress, 0, 0)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

			console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
			console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
			console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		// for (let i = 1; i < 3; i++) {
		// 	const { lendingMarketAdapter } = await getDeployedContracts();
		// 	let withdrawalAmount = (await poolToken.balanceOf(accounts[i]))

		// 	console.log(`\n Withdrawal ${i} \n`)

		// 	console.log("AAVE_INTEREST_BEARING_USDC", (await (await LetoToken.at(AAVE_INTEREST_BEARING_USDC)).balanceOf(poolAddress)).toString())
		// 	console.log("AAVE_DEBT_BEARING_STABLE_USDC", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_USDC)).balanceOf(poolAddress)).toString())
		// 	console.log("AAVE_INTEREST_BEARING_WETH", (await (await LetoToken.at(AAVE_INTEREST_BEARING_WETH)).balanceOf(poolAddress)).toString())
		// 	console.log("AAVE_DEBT_BEARING_STABLE_WETH", (await (await LetoToken.at(AAVE_DEBT_BEARING_STABLE_WETH)).balanceOf(poolAddress)).toString())

		// 	console.log(`USDC Balance of account before withdrawal: ${i}`, (await USDC.balanceOf(accounts[i])).toString())
		// 	console.log(`L-ETHup Balance of account before withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

		// 	await poolToken.approve(pool.address, withdrawalAmount, { from: accounts[i] })
		// 	await pool.redeem(withdrawalAmount, { from: accounts[i] })

		// 	poolState = await strategyAdapter.poolState.call(poolAddress)

		// 	console.log(`USDC Balance of account after withdrawal: ${i}`, (await USDC.balanceOf(accounts[i])).toString())
		// 	console.log(`L-ETHup Balance of account after withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

		// 	console.log("USDC Balance", poolState.balance0)
		// 	console.log("WETH Balance", poolState.balance1)
		// 	console.log("deposited", poolState.deposited)
		// 	console.log("borrowed", poolState.borrowed)
		// 	console.log("netValue", poolState.netValue)
		// 	console.log("leverage", poolState.leverage)
		// 	console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(pool.address)).toString())
		// 	console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
		// 	console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		// }
	})
})
