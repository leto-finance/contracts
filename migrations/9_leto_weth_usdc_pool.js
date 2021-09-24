const { encode } = require('rlp')

const SwapRouterJSON = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json')

const LetoPool = artifacts.require("LetoPool");
const LetoToken = artifacts.require("LetoToken");
const LetoRegistry = artifacts.require("LetoRegistry");
const LetoDeployer = artifacts.require("LetoDeployer");
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter");
const LetoPriceConsumer = artifacts.require("LetoPriceConsumer");
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter");
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const PRICE_FEED = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"

module.exports = function (deployer, network, accounts) {
	deployer.then(async () => {
		if (network != "mainfork") { return Promise.resolve() }

		const { BN } = web3.utils
		const contract = require('@truffle/contract')

		const registry = await LetoRegistry.deployed()
		const deployer = await LetoDeployer.deployed()
		const lendingMarketAdapter = await LetoAaveAdapter.deployed()
		const exchangeAdapter = await LetoUniswapAdapter.deployed()
		const strategyAdapter = await LetoLongStrategyAdapter.deployed()

		const USDC = await LetoToken.at(USDCAddress)
		const USDCDecimals = (new BN(10)).pow(await USDC.decimals())

		const swapRouterContract = contract({ abi: SwapRouterJSON.abi, unlinked_binary: SwapRouterJSON.bytecode })
		swapRouterContract.setProvider(web3.currentProvider)
		const swapRouter = await swapRouterContract.at(SWAP_ROUTER)

		await swapRouter.exactInputSingle(
			{
				tokenIn: WETHAddress,
				tokenOut: USDCAddress,
				fee: 3000,
				recipient: accounts[0],
				deadline: Math.round((new Date()).getTime() / 10 ** 3) + 1000,
				amountIn: web3.utils.toWei("5", "ether"),
				amountOutMinimum: 0,
				sqrtPriceLimitX96: 0,
			}, {
				from: accounts[0],
				value: web3.utils.toWei("5", "ether")
			}
		);

		const poolToken = await LetoToken.new("L-ETHdown", "L-ETHdown", 24)
		await poolToken.transferOwnership(deployer.address)

		await registry.setAddress("PriceFeed:L-ETHdown", PRICE_FEED)

		const rate = 10000000000 // 100 USDC for 1 L-ETHdown
		const initialDeposit = (new BN(10000)).mul(USDCDecimals) // 10000 USDC = 10 L-ETHdown

		await USDC.transfer(deployer.address, initialDeposit)

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			USDCAddress, WETHAddress,
			2000,
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		const nonce = await web3.eth.getTransactionCount(deployer.address)
		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, nonce])).substr(26)

		console.log("Pool L-ETHdown address:", poolAddress)

		await deployer.deployPool(...deployArgs)
		const pool = await LetoPool.at(poolAddress)

		console.log(await pool.parameters.call())
	})
};
