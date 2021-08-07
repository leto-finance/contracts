const SwapRouterJSON = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json')

const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')

// Contracts
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
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const PRICE_FEED = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"

async function getDeployedContracts() {
	const token = await LetoToken.deployed()
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoUniswapAdapter.deployed()
	const strategyAdapter = await LetoShortStrategyAdapter.deployed()

	return {
		token,
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
		const [pool_owner] = accounts
		const { token, registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts();

		const contract = require('@truffle/contract')

		const swapRouterContract = contract({ abi: SwapRouterJSON.abi, unlinked_binary: SwapRouterJSON.bytecode })
		swapRouterContract.setProvider(web3.currentProvider)
		const swapRouter = await swapRouterContract.at(SWAP_ROUTER)

		for (let i = 0; i < 3; i++) {
			await swapRouter.exactInputSingle(
				{
					tokenIn: WETH,
					tokenOut: USDC,
					fee: 3000,
					recipient: accounts[i],
					deadline: Math.round((new Date()).getTime() / 10 ** 3) + 1000,
					amountIn: web3.utils.toWei("10", "ether"),
					amountOutMinimum: 0,
					sqrtPriceLimitX96: 0,
				}, {
				from: pool_owner,
				value: web3.utils.toWei("10", "ether")
			}
			);
		}

		asset0 = await LetoToken.at(USDC)
		asset1 = await LetoToken.at(WETH)

		const poolToken = await LetoTokenMock.new("L-ETHdown", "L-ETHdown", 6)
		await poolToken.transferOwnership(deployer.address)

		await registry.setAddress("PriceFeed:USDC/WETH", PRICE_FEED, { from: pool_owner })
		await registry.setAddress("USDC", asset0.address, { from: pool_owner })

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const decimals0 = (new BN(10)).pow(await asset0.decimals())
		const decimals1 = (new BN(10)).pow(await asset1.decimals())

		const price = (new BN(100)).mul(decimalsPool) // 100 USDC
		const initialDeposit = (new BN(10000)).mul(decimals0) // 10.000 USDC

		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, 1])).substr(26)
		await asset0.transfer(deployer.address, initialDeposit, { from: pool_owner })

		const deployArgs = [
			strategyAdapter.address,
			poolToken.address,
			asset0.address, asset1.address,
			20000, // decimals 10 ^ 4
			price, "USDC",
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await deployer.deployPool(...deployArgs, { from: pool_owner })

		pool = await LetoPool.at(poolAddress)

		console.log("Initial state")

		let poolState = await strategyAdapter.poolState.call(poolAddress)

		console.log("USDC Balance", poolState.balance0)
		console.log("WETH Balance", poolState.balance1)
		console.log("deposited", poolState.deposited)
		console.log("borrowed", poolState.borrowed)
		console.log("netValue", poolState.netValue)
		console.log("leverage", poolState.leverage)
		console.log("ltv", (await pool.ltv.call()).toString())
		console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
		console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
		console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())

		for (let i = 0; i < 3; i++) {
			console.log(`\n Rebalancing ${i} \n`)

			await strategyAdapter.rebalance(poolAddress)
			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 0; i < 2; i++) {
			const depoitAmount = (new BN(1000)).mul(decimals0) // 1.000 USDC
			await asset0.approve(pool.address, depoitAmount, { from: accounts[i + 1] })
			await pool.deposit(depoitAmount, { from: accounts[i + 1] })

			console.log(`\n Deposit ${i} \n`)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`L-ETHup Balance of account: ${i + 1}`, (await poolToken.balanceOf(accounts[i + 1])).toString())
			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 0; i < 3; i++) {
			await strategyAdapter.rebalance(poolAddress)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 0; i < 1; i++) {
			if (i == 0) {
				withdrawalAmount = (new BN(20)).mul(decimalsPool) // 30 L-ETHup
			}

			console.log(`\n Withdrawal ${i} \n`)

			console.log(`USDC Balance of account before withdrawal: ${i}`, (await asset0.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account before withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			await poolToken.approve(pool.address, withdrawalAmount, { from: accounts[i] })
			await pool.withdraw(withdrawalAmount, { from: accounts[i] })

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`USDC Balance of account after withdrawal: ${i}`, (await asset0.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account after withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}


		for (let i = 0; i < 3; i++) {
			await strategyAdapter.rebalance(poolAddress)

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`\n Rebalancing ${i} \n`)

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}

		for (let i = 0; i < 3; i++) {
			let withdrawalAmount = (new BN(10)).mul(decimalsPool)

			if (i == 0) {
				withdrawalAmount = (new BN(53)).mul(decimalsPool)
			}

			console.log(`\n Withdrawal ${i} \n`)

			console.log(`USDC Balance of account before withdrawal: ${i}`, (await asset0.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account before withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			await poolToken.approve(pool.address, withdrawalAmount, { from: accounts[i] })
			await pool.withdraw(withdrawalAmount, { from: accounts[i] })

			poolState = await strategyAdapter.poolState.call(poolAddress)

			console.log(`USDC Balance of account after withdrawal: ${i}`, (await asset0.balanceOf(accounts[i])).toString())
			console.log(`L-ETHup Balance of account after withdrawal: ${i}`, (await poolToken.balanceOf(accounts[i])).toString())

			console.log("USDC Balance", poolState.balance0)
			console.log("WETH Balance", poolState.balance1)
			console.log("deposited", poolState.deposited)
			console.log("borrowed", poolState.borrowed)
			console.log("netValue", poolState.netValue)
			console.log("leverage", poolState.leverage)
			console.log("ltv", (await pool.ltv.call()).toString())
			console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
			console.log("maxWithdrawal", (await pool.calculateMaxWithdrawal.call()).toString())
			console.log("latestPairPrice", (await pool.latestPairPrice.call()).toString())
		}
	})
})
