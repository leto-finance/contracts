const { expectRevert } = require('@openzeppelin/test-helpers')
const { encode } = require('rlp')


// Contracts
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter")
const LetoExchangeAdapter = artifacts.require("LetoUniswapAdapter")
const LetoShortStrategyAdapter = artifacts.require("LetoShortStrategyAdapter")
const LetoRegistry = artifacts.require("LetoRegistry")
const LetoDeployer = artifacts.require("LetoDeployer")
const LetoToken = artifacts.require("LetoToken")
const LetoPool = artifacts.require("LetoPool")

// Mocks
const AggregatorV3Mock = artifacts.require("AggregatorV3Mock")
const LetoTokenMock = artifacts.require("LetoTokenMock")

async function getDeployedContracts() {
	const token = await LetoToken.deployed()
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoExchangeAdapter.deployed()
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

contract("LetoPool Short", accounts => {
	const { BN } = web3.utils

	const poolTokenDecimals = 18;
	const WETHDecimals = 18;
	const USDCDecimals = 6;

	const rate = 10000000000 // 100 USDC for 1 L-ETHdown

	let pool, poolToken, USDC, WETH, aggregatorV3Mock

	it("should deploy LetoPool with correct parameters", async () => {
		const [poolOwner] = accounts
		const { token, registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts()

		USDC =      await LetoTokenMock.new("USD Coin",         "USDC",      USDCDecimals,      { from: poolOwner })
		WETH =      await LetoTokenMock.new("Wrapped Ethereum", "WETH",      WETHDecimals,      { from: poolOwner })
		poolToken = await LetoTokenMock.new("L-ETHdown",        "L-ETHdown", poolTokenDecimals, { from: poolOwner })

		await poolToken.transferOwnership(deployer.address)

		aggregatorV3Mock = await AggregatorV3Mock.new({ from: poolOwner })

		await registry.setAddress("PriceFeed:L-ETHdown", aggregatorV3Mock.address, { from: poolOwner })
		await registry.setAddress("USDC", USDC.address, { from: poolOwner })
		await registry.setAddress("WETH", WETH.address, { from: poolOwner })

		const decimals = (new BN(10)).pow(new BN(18))
		const initialDeposit = (new BN(1000)).mul((new BN(10)).pow(new BN(USDCDecimals))) // 1000 USDC = 10 L-ETHdown

		await USDC.mint(poolOwner, initialDeposit, { from: poolOwner })

		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, 1])).substr(26)
		await USDC.transfer(deployer.address, initialDeposit, { from: poolOwner })

		assert.equal(
			(await USDC.balanceOf.call(deployer.address, { from: poolOwner })).toString(),
			initialDeposit.toString()
		)

		const deployArgs = [
			strategyAdapter.address, poolToken.address,
			USDC.address, WETH.address,
			2, //FIXME: add decimals
			rate,
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await aggregatorV3Mock.setPrice("315317565712")

		await deployer.deployPool(...deployArgs, { from: poolOwner })

		pool = await LetoPool.at(poolAddress)

		const parameters = await pool.parameters()
		const poolBalance = await USDC.balanceOf.call(pool.address, { from: poolOwner })

		assert.equal((await pool._priceFeed.call()), aggregatorV3Mock.address)
		assert.equal((await poolToken.balanceOf.call(poolOwner)).toString(), ((new BN(10)).mul((new BN(10)).pow(new BN(poolTokenDecimals)))).toString())
		assert.equal(poolBalance.toString(), initialDeposit.toString())
		assert.equal(parameters.asset0, USDC.address)
		assert.equal(parameters.asset1, WETH.address)
		assert.equal(parameters.name, "L-ETHdown")
		assert.equal(parameters.symbol, "L-ETHdown")
		assert.equal(parameters.target_leverage, "2")
		assert.equal(parameters.rate, rate)
		assert.equal(parameters.lending_market_adapter, lendingMarketAdapter.address)
		assert.equal(parameters.exchange_adapter, exchangeAdapter.address)
	})

	it("should mint correct amount of L-ETHdown tokens of pool for USDC deposit", async () => {
		const [poolOwner, alice, bob] = accounts
		const { token, registry } = await getDeployedContracts()

		const poolToken = await LetoToken.at(await pool.token())

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const depoitAmount = (new BN(100)).mul((new BN(10)).pow(new BN(USDCDecimals))) // $100 = 1 L-ETHdown

		await USDC.mint(alice, new BN(depoitAmount), { from: poolOwner })
		const aliceBalance = await USDC.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			depoitAmount,
			"Balance USDC isn`t correct"
		)

		const poolBalanceBeforeDeposit = await USDC.balanceOf.call(pool.address, { from: alice })

		await USDC.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await USDC.balanceOf.call(alice, { from: alice })

		const poolBalance = await USDC.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount,
			"Balance USDC isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.toString(),
			(new BN(1)).mul(decimalsPool).toString(), // 1 L-ETHdown
			"Balance L-ETHdown isn`t correct"
		)
	})

	it("should revert tx when user send ethereum to pool", async () => {
		const [_, alice] = accounts
		await expectRevert(pool.send(10, { from: alice }), "revert")
	})

	it("should transfer correnct amount of L-ETHdown to user for USDC tokens", async () => {
		const [poolOwner, alice] = accounts

		const poolToken = await LetoToken.at(await pool.token())
		const withdrawalAmount = new BN("1000000000000000000") // 1 * (10 ** 18) = 1 L-ETHdown

		const poolBalanceBeforeWithdrawal = await USDC.balanceOf(pool.address)

		await poolToken.approve(pool.address, withdrawalAmount, { from: alice })
		await pool.redeem(withdrawalAmount, { from: alice })

		const aliceBalance = await USDC.balanceOf(alice)
		const poolTokenBalance = await poolToken.balanceOf(alice)
		const poolBalanceAfterWithdrawal = await USDC.balanceOf(pool.address)

		assert.equal(
			poolBalanceAfterWithdrawal.toString(),
			(new BN(1000)).mul((new BN(10)).pow(new BN(USDCDecimals))), // initial deposit amount
			"Balance USDC isn`t correct"
		)

		assert.equal(
			poolTokenBalance.toString(),
			"0", // 0 L-ETHdown
			"Balance L-ETHdown isn`t correct"
		)

		assert.equal(
			aliceBalance.toString(),
			(new BN(100)).mul((new BN(10)).pow(new BN(USDCDecimals))), // alice deposit amount
			"Balance USDC isn`t correct"
		)
	})

	it("should mint correct amount of L-ETHup tokens of pool for USDC deposit when WETH price increase x2", async () => {
		const [poolOwner, alice, bob] = accounts
		const { token, registry } = await getDeployedContracts()
		const poolToken = await LetoToken.at(await pool.token())

		await aggregatorV3Mock.setPrice("630635131424")

		const aliceBalance = await USDC.balanceOf(alice, { from: alice })
		const depoitAmount = aliceBalance

		assert.equal(
			aliceBalance.toString(),
			"100000000",
			"Balance USDC isn`t correct"
		)

		const poolBalanceBeforeDeposit = await USDC.balanceOf.call(pool.address, { from: alice })

		await USDC.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await USDC.balanceOf.call(alice, { from: alice })
		const poolBalance = await USDC.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount.toString(),
			"Balance USDC isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.toString(),
			(new BN(2)).mul((new BN(10)).pow((await poolToken.decimals()))).toString(), // 2 L-ETHup
			"Balance L-ETHup isn`t correct"
		)
	})

	it("should mint correct amount of L-ETHup tokens of pool for USDC deposit when WETH price decrease x2", async () => {
		const [poolOwner, alice, bob] = accounts
		const { token, registry } = await getDeployedContracts()
		const poolToken = await LetoToken.at(await pool.token())

		await aggregatorV3Mock.setPrice("157658782856")

		const alicePoolTokenBalanceBefore = await poolToken.balanceOf.call(alice, { from: alice })

		const depoitAmount = (new BN(100)).mul((new BN(10)).pow(new BN(USDCDecimals))) // $100 = 0.5 L-ETHdown
		await USDC.mint(alice, new BN(depoitAmount), { from: poolOwner })
		const aliceBalance = await USDC.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			"100000000",
			"Balance USDC isn`t correct"
		)

		const poolBalanceBeforeDeposit = await USDC.balanceOf.call(pool.address, { from: alice })

		await USDC.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await USDC.balanceOf.call(alice, { from: alice })
		const poolBalance = await USDC.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			depoitAmount.toString(),
			"Balance USDC isn`t correct"
		)

		assert.equal(
			alicePoolTokenBalance.sub(alicePoolTokenBalanceBefore).toString(),
			(new BN(5)).mul((new BN(10)).pow((await poolToken.decimals()).sub(new BN(1)))).toString(), // 0.5 L-ETHup
			"Balance L-ETHup isn`t correct"
		)
	})
})