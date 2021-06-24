const SwapRouterJSON = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json')

const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')

// Contracts
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter")
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter")
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter")
const LetoRegistry = artifacts.require("LetoRegistry")
const LetoDeployer = artifacts.require("LetoDeployer")
const LetoToken = artifacts.require("LetoToken")
const LetoPool = artifacts.require("LetoPool")
const LetoTokenMock = artifacts.require("LetoTokenMock")

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
	const strategyAdapter = await LetoLongStrategyAdapter.deployed()

	return {
		token,
		registry,
		deployer,
		lendingMarketAdapter,
		exchangeAdapter,
		strategyAdapter,
	}
}

contract("LetoLongStrategy", accounts => {
	it("should calculate pool token price according to strategy", async () => {
		const { BN } = web3.utils
		const [pool_owner] = accounts
		const { token, registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts();

		const contract = require('@truffle/contract')

		const swapRouterContract = contract({ abi: SwapRouterJSON.abi, unlinked_binary: SwapRouterJSON.bytecode })
		swapRouterContract.setProvider(web3.currentProvider)
		const swapRouter = await swapRouterContract.at(SWAP_ROUTER)

		const res = await swapRouter.exactInputSingle(
			{
				tokenIn: WETH,
				tokenOut: USDC,
				fee: 3000,
				recipient: pool_owner,
				deadline: Math.round((new Date()).getTime() / 10 ** 3) + 1000,
				amountIn: web3.utils.toWei("10", "ether"),
				amountOutMinimum: 0,
				sqrtPriceLimitX96: 0,
			}, {
				from: pool_owner,
				value: web3.utils.toWei("10", "ether")
			}
		);

		asset0 = await LetoToken.at(USDC)
		asset1 = await LetoToken.at(WETH)

		const poolToken = await LetoTokenMock.new("L-ETHup", "L-ETHup", 6)
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
			2,
			price, "USDC",
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await deployer.deployPool(...deployArgs, { from: pool_owner })

		pool = await LetoPool.at(poolAddress)

		console.log("Initial state");

		console.log("deposited", (await strategyAdapter.deposited.call(poolAddress)).div(decimals1).toString())
		console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
		console.log("latestPairPrice", (await pool.latestPairPrice.call()).div(decimals1).toString())
		console.log("borrowed", (await lendingMarketAdapter.borrowed.call(lendingMarketAdapter.address)).toString())
		console.log("balanceOf USDC", (await asset0.balanceOf.call(poolAddress)).div(decimals0).toString())
		console.log("balanceOf WETH", (await asset1.balanceOf.call(poolAddress)).div(decimals1).toString())
		console.log("leverage", (await strategyAdapter.leverage.call(poolAddress)).toString())

		await strategyAdapter.rebalance(poolAddress)

		console.log("\n After first rebalancing \n");

		console.log("deposited", (await strategyAdapter.deposited.call(poolAddress)).div(decimals1).toString())
		console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
		console.log("latestPairPrice", (await pool.latestPairPrice.call()).div(decimals1).toString())
		console.log("borrowed", (await lendingMarketAdapter.borrowed.call(lendingMarketAdapter.address)).toString())
		console.log("balanceOf USDC", (await asset0.balanceOf.call(poolAddress)).div(decimals0).toString())
		console.log("balanceOf WETH", (await asset1.balanceOf.call(poolAddress)).div(decimals1).toString())
		console.log("leverage", (await strategyAdapter.leverage.call(poolAddress)).toString())

		await strategyAdapter.rebalance(poolAddress)

		console.log("\n After second rebalancing \n");

		console.log("deposited", (await strategyAdapter.deposited.call(poolAddress)).div(decimals1).toString())
		console.log("availableBorrows", (await lendingMarketAdapter.availableBorrows.call(lendingMarketAdapter.address)).toString())
		console.log("latestPairPrice", (await pool.latestPairPrice.call()).div(decimals1).toString())
		console.log("borrowed", (await lendingMarketAdapter.borrowed.call(lendingMarketAdapter.address)).toString())
		console.log("balanceOf USDC", (await asset0.balanceOf.call(poolAddress)).div(decimals0).toString())
		console.log("balanceOf WETH", (await asset1.balanceOf.call(poolAddress)).div(decimals1).toString())
		console.log("leverage", (await strategyAdapter.leverage.call(poolAddress)).toString())

		// const parameters = await pool.parameters()
		// const poolBalance = await asset0.balanceOf.call(pool.address, { from: pool_owner })

		// const poolToken = await LetoToken.at(await pool.token())
		// const deployerBalance = await poolToken.balanceOf.call(deployer.address, { from: pool_owner })

		// assert.equal(deployerBalance.toString(), initialDeposit.div(price).mul(decimals1).toString())

		// assert.equal(poolBalance.toString(), initialDeposit.toString())
		// assert.equal(parameters.asset0, asset0.address)
		// assert.equal(parameters.asset1, asset1.address)
		// assert.equal(parameters.name, "L-ETHup")
		// assert.equal(parameters.symbol, "L-ETHup")
		// assert.equal(parameters.target_leverage, "2")
		// assert.equal(parameters.pool_token_price, price)
		// assert.equal(parameters.bid_token_symbol, 'USDC')
		// assert.equal(parameters.lending_market_adapter, lendingMarketAdapter.address)
		// assert.equal(parameters.exchange_adapter, exchangeAdapter.address)
	})
})
