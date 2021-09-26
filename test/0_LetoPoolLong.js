const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')


// Contracts
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter")
const LetoExchangeAdapter = artifacts.require("LetoUniswapAdapter")
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter")
const LetoRegistry = artifacts.require("LetoRegistry")
const LetoDeployer = artifacts.require("LetoDeployer")
const LetoToken = artifacts.require("LetoToken")
const LetoPool = artifacts.require("LetoPool")

// Mocks
const AggregatorV3Mock = artifacts.require("AggregatorV3Mock")
const LetoTokenMock = artifacts.require("LetoTokenMock")

async function getDeployedContracts() {
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoExchangeAdapter.deployed()
	const strategyAdapter = await LetoLongStrategyAdapter.deployed()

	return {
		registry,
		deployer,
		lendingMarketAdapter,
		exchangeAdapter,
		strategyAdapter,
	}
}

contract("LetoPool long", accounts => {
	const { BN } = web3.utils

	const poolTokenDecimals = 24;
	const WETHDecimals = 18;
	const USDCDecimals = 6;

	const rate = 31531756 // 100 USD for 1 L-ETHup at a 1 ETH = 3153 USD

	let pool, poolToken, USDC, WETH, aggregatorV3Mock

	it("should deploy LetoPool with correct parameters", async () => {
		const [poolOwner] = accounts
		const { registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts()

		USDC =      await LetoTokenMock.new("USD Coin",         "USDC",    USDCDecimals,      { from: poolOwner })
		WETH =      await LetoTokenMock.new("Wrapped Ethereum", "WETH",    WETHDecimals,      { from: poolOwner })
		poolToken = await LetoTokenMock.new("TEST:L-ETHup",     "TEST:L-ETHup", poolTokenDecimals, { from: poolOwner })

		await poolToken.transferOwnership(deployer.address)

		aggregatorV3Mock = await AggregatorV3Mock.new({ from: poolOwner })

		await registry.setAddress("PriceFeed:TEST:L-ETHup", aggregatorV3Mock.address, { from: poolOwner })
		await registry.setAddress("USDC", USDC.address, { from: poolOwner })
		await registry.setAddress("WETH", WETH.address, { from: poolOwner })

		const decimals = (new BN(10)).pow(new BN(18))
		const initialDeposit = new BN("317140599464235357") // WETH 0.317140599464235357 (wei) * $3153 ~ $1000 / $100 = 10 L-ETHup

		await WETH.mint(poolOwner, initialDeposit, { from: poolOwner })

		const nonce = await web3.eth.getTransactionCount(deployer.address)
		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, nonce])).substr(26)

		await WETH.transfer(deployer.address, initialDeposit, { from: poolOwner })

		assert.equal(
			(await WETH.balanceOf.call(deployer.address, { from: poolOwner })).toString(),
			initialDeposit.toString()
		)

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			WETH.address, USDC.address,
			20000, // decimals 4
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await aggregatorV3Mock.setPrice("315317565712")

		await deployer.deployPool(...deployArgs, { from: poolOwner })

		pool = await LetoPool.at(poolAddress)

		const parameters = await pool.parameters()
		const poolBalance = await WETH.balanceOf.call(pool.address, { from: poolOwner })

		assert.equal((await pool._priceFeed.call()), aggregatorV3Mock.address)
		assert.equal((await poolToken.balanceOf.call(poolOwner)).toString(), ((new BN(10)).mul((new BN(10)).pow(new BN(poolTokenDecimals))).add(new BN(3496892))).toString())
		assert.equal(poolBalance.toString(), initialDeposit.toString())
		assert.equal(parameters.asset0, WETH.address)
		assert.equal(parameters.asset1, USDC.address)
		assert.equal(parameters.name, "TEST:L-ETHup")
		assert.equal(parameters.symbol, "TEST:L-ETHup")
		assert.equal(parameters.target_leverage, "20000")
		assert.equal(parameters.rate, rate)
		assert.equal(parameters.lending_market_adapter, lendingMarketAdapter.address)
		assert.equal(parameters.exchange_adapter, exchangeAdapter.address)
	})

	it("should mint correct amount of L-ETHup tokens of pool for WETH deposit", async () => {
		const [poolOwner, alice, bob] = accounts
		const { registry } = await getDeployedContracts()
		const poolToken = await LetoToken.at(await pool.token())
		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())

		const depoitAmount = new BN("31714059946423536") // WETH 0.031714059946423536 (wei) * $3153 ~ $10 / $100 = 1 L-ETHup
		await WETH.mint(alice, new BN(depoitAmount), { from: poolOwner })
		const aliceBalance = await WETH.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			depoitAmount,
			"Balance WETH isn`t correct"
		)

		const poolBalanceBeforeDeposit = await WETH.balanceOf.call(pool.address, { from: alice })

		await WETH.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await WETH.balanceOf.call(alice, { from: alice })

		const poolBalance = await WETH.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount,
			"Balance WETH isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.toString(),
			(new BN(1)).mul(decimalsPool).add(new BN(9809216)).toString(), // 1 L-ETHup
			"Balance L-ETHup isn`t correct"
		)
	})

	it("should revert tx when user send ethereum to pool", async () => {
		const [_, alice] = accounts
		await expectRevert(pool.send(10, { from: alice }), "revert")
	})

	it("should mint correct amount of L-ETHup tokens of pool for WETH deposit when WETH price increase x2", async () => {
		const [poolOwner, alice, bob] = accounts
		const { registry } = await getDeployedContracts()
		const poolToken = await LetoToken.at(await pool.token())

		await aggregatorV3Mock.setPrice("630635131424")

		const alicePoolTokenBalanceBefore = await poolToken.balanceOf.call(alice, { from: alice })

		const depoitAmount = "31714059946423536" // WETH 0.31714059946423536
		await WETH.mint(alice, depoitAmount, { from: poolOwner })
		const aliceBalance = await WETH.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			"31714059946423536",
			"Balance WETH isn`t correct"
		)

		const poolBalanceBeforeDeposit = await WETH.balanceOf.call(pool.address, { from: alice })

		await WETH.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await WETH.balanceOf.call(alice, { from: alice })
		const poolBalance = await WETH.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount,
			"Balance WETH isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.sub(alicePoolTokenBalanceBefore).toString(),
			(new BN(5)).mul((new BN(10)).pow((await poolToken.decimals()).sub(new BN(1)))).add(new BN(4904608)).toString(), // 0.5 L-ETHup
			"Balance L-ETHup isn`t correct"
		)
	})

	it("should mint correct amount of L-ETHup tokens of pool for WETH deposit when WETH price decrease x2", async () => {
		const [poolOwner, alice, bob] = accounts
		const { registry } = await getDeployedContracts()
		const poolToken = await LetoToken.at(await pool.token())

		await aggregatorV3Mock.setPrice("157658782856")

		const alicePoolTokenBalanceBefore = await poolToken.balanceOf.call(alice, { from: alice })

		const depoitAmount = new BN("31714059946423536") // WETH 0.031714059946423536 (wei) * $3153 ~ $10 / $100 = 2 L-ETHup
		await WETH.mint(alice, new BN(depoitAmount), { from: poolOwner })
		const aliceBalance = await WETH.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			"31714059946423536",
			"Balance WETH isn`t correct"
		)

		const poolBalanceBeforeDeposit = await WETH.balanceOf.call(pool.address, { from: alice })

		await WETH.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await WETH.balanceOf.call(alice, { from: alice })
		const poolBalance = await WETH.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount,
			"Balance WETH isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.sub(alicePoolTokenBalanceBefore).toString(),
			(new BN(2)).mul((new BN(10)).pow((await poolToken.decimals()))).add(new BN(19618432)).toString(), // 2 L-ETHup
			"Balance L-ETHup isn`t correct"
		)
	})
})