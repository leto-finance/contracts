const { encode } = require('rlp')

const WETH9 = artifacts.require("WETH9");
const LetoPool = artifacts.require("LetoPool");
const LetoToken = artifacts.require("LetoToken");
const LetoRegistry = artifacts.require("LetoRegistry");
const LetoDeployer = artifacts.require("LetoDeployer");
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter");
const LetoPriceConsumer = artifacts.require("LetoPriceConsumer");
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter");
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const PRICE_FEED = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"

module.exports = function (deployer, network, accounts) {
	deployer.then(async () => {
		if (network != "mainfork") { return Promise.resolve() }

		const { BN } = web3.utils

		const registry = await LetoRegistry.deployed()
		const deployer = await LetoDeployer.deployed()
		const lendingMarketAdapter = await LetoAaveAdapter.deployed()
		const exchangeAdapter = await LetoUniswapAdapter.deployed()
		const strategyAdapter = await LetoLongStrategyAdapter.deployed()

		const weth9 = await WETH9.at(WETHAddress)
		const WETH = await LetoToken.at(WETHAddress)

		await weth9.deposit({
			value: web3.utils.toWei("5", "ether")
		});

		const poolToken = await LetoToken.new("L-ETHup", "L-ETHup", 24)
		await poolToken.transferOwnership(deployer.address)

		await registry.setAddress("PriceFeed:L-ETHup", PRICE_FEED)

		await registry.setAddress("Aave:interest_bearing:USDC", "0xBcca60bB61934080951369a648Fb03DF4F96263C");
		await registry.setAddress("Aave:debt_bearing:stable:USDC", "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6");
		await registry.setAddress("Aave:interest_bearing:WETH", "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e");
		await registry.setAddress("Aave:debt_bearing:stable:WETH", "0x4e977830ba4bd783C0BB7F15d3e243f73FF57121");

		const priceConsumer = await LetoPriceConsumer.new()

		const latestPairPrice = await priceConsumer.getPrice.call(PRICE_FEED)
		rate = (new BN(10)).pow(new BN(22)).div(latestPairPrice) // 100 USD for 1 L-ETHup
		const initialDeposit = ((new BN(10)).pow(new BN(24))).div(rate).mul(new BN(100)); // 10000 USD for 100 L-ETHup

		await WETH.transfer(deployer.address, initialDeposit)

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			WETHAddress, USDCAddress,
			2000,
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		const nonce = await web3.eth.getTransactionCount(deployer.address)
		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, nonce])).substr(26)

		console.log("Pool L-ETHup address:", poolAddress)

		await deployer.deployPool(...deployArgs)
		const pool = await LetoPool.at(poolAddress)

		console.log("\n========L-ETHup State========\n")
		console.log(await pool.state.call())
		console.log("\n=========================== \n")
	})
};
