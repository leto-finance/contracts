const { expectRevert } = require('@openzeppelin/test-helpers');
const { encode } = require('rlp');


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
	const token = await LetoToken.deployed()
	const registry = await LetoRegistry.deployed()
	const deployer = await LetoDeployer.deployed()
	const lendingMarketAdapter = await LetoAaveAdapter.deployed()
	const exchangeAdapter = await LetoExchangeAdapter.deployed()
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

contract("LetoPool", accounts => {
	const { BN } = web3.utils

	let pool, asset0, asset1, aggregatorV3Mock;

	it("should deploy LetoPool with correct parameters", async () => {
		const [pool_owner] = accounts
		const { token, registry, deployer, lendingMarketAdapter, exchangeAdapter, strategyAdapter } = await getDeployedContracts();

		asset0 = await LetoTokenMock.new("USD Coin", "USDC", 18, { from: pool_owner })
		asset1 = await LetoTokenMock.new("wrapped ethereum", "WETH", 6, { from: pool_owner })
		const poolToken = await LetoTokenMock.new("L-ETHup", "L-ETHup", 6);

		await poolToken.transferOwnership(deployer.address);

		aggregatorV3Mock = await AggregatorV3Mock.new({ from: pool_owner })

		await registry.setAddress("PriceFeed:USDC/WETH", aggregatorV3Mock.address, { from: pool_owner })
		await registry.setAddress("USDC", asset0.address, { from: pool_owner })

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const decimals0 = (new BN(10)).pow(await asset0.decimals())
		const decimals1 = (new BN(10)).pow(await asset1.decimals())

		const price = (new BN(100)).mul(decimals0) // 100 USDC
		const initialDeposit = (new BN(10000)).mul(decimals0); // 10.000 USDC

		await asset0.mint(pool_owner, initialDeposit, { from: pool_owner })

		const poolAddress = "0x" + web3.utils.sha3(encode([deployer.address, 1])).substr(26);
		await asset0.transfer(deployer.address, initialDeposit, { from: pool_owner })

		assert.equal(
			(await asset0.balanceOf.call(deployer.address, { from: pool_owner })).toString(),
			initialDeposit.toString()
		);

		const deployArgs = [
			strategyAdapter.address,
			poolToken.address,
			asset0.address, asset1.address,
			2,
			price, "USDC",
			lendingMarketAdapter.address, exchangeAdapter.address,
			initialDeposit
		]

		await aggregatorV3Mock.setPrice("428636336359505")
		
		const rx = await deployer.deployPool(...deployArgs, { from: pool_owner })

		pool = await LetoPool.at(poolAddress)

		const parameters = await pool.parameters()
		const poolBalance = await asset0.balanceOf.call(pool.address, { from: pool_owner })

		assert.equal((await pool._priceFeed.call()), aggregatorV3Mock.address);

		assert.equal((await poolToken.balanceOf.call(pool_owner)).toString(), ((new BN(100)).mul(decimalsPool)).toString());

		assert.equal(poolBalance.toString(), initialDeposit.toString());
		assert.equal(parameters.asset0, asset0.address);
		assert.equal(parameters.asset1, asset1.address);
		assert.equal(parameters.name, "L-ETHup");
		assert.equal(parameters.symbol, "L-ETHup");
		assert.equal(parameters.target_leverage, "2");
		assert.equal(parameters.pool_token_price, price);
		assert.equal(parameters.bid_token_symbol, 'USDC');
		assert.equal(parameters.lending_market_adapter, lendingMarketAdapter.address);
		assert.equal(parameters.exchange_adapter, exchangeAdapter.address);
	})

	it("should mint correct amount of L-ETHup tokens of pool for USDC deposit", async () => {
		const [pool_owner, alice, bob] = accounts
		const { token, registry } = await getDeployedContracts();
		const poolToken = await LetoToken.at(await pool.token())

		const decimalsPool = (new BN(10)).pow(await poolToken.decimals())
		const decimals0 = (new BN(10)).pow(await asset0.decimals())

		const depoitAmount = "100000000000000999999" // 100.00000000000999999 USDC

		await asset0.mint(alice, new BN(depoitAmount), { from: pool_owner })
		const aliceBalance = await asset0.balanceOf(alice, { from: alice })

		assert.equal(
			aliceBalance.toString(),
			depoitAmount,
			"Balance USDC isn`t correct"
		);

		const poolBalanceBeforeDeposit = await asset0.balanceOf.call(pool.address, { from: alice })

		await asset0.approve(pool.address, depoitAmount, { from: alice })
		await pool.deposit(depoitAmount, { from: alice })

		const alicePoolTokenBalance = await poolToken.balanceOf.call(alice, { from: alice })
		const alicePostBalance = await asset0.balanceOf.call(alice, { from: alice })
		const poolBalance = await asset0.balanceOf.call(pool.address, { from: alice })

		assert.equal(
			(poolBalance.sub(poolBalanceBeforeDeposit)).toString(),
			(new BN(100)).mul(decimals0).toString(), // 100 USDT
			"Balance L-ETHup isn`t correct"
		);

		assert.equal(
			alicePostBalance.toString(),
			"999999", // 0.00000000000999999 USDC
			"Balance USDC isn`t correct"
		);

		assert.equal(
			alicePoolTokenBalance.toString(),
			(new BN(1)).mul(decimalsPool).toString(), // 1 L-ETHup
			"Balance L-ETHup isn`t correct"
		);
	})

	it("should revert tx when user send ethereum to pool", async () => {
		const [_, alice] = accounts
		await expectRevert(pool.send(10, { from: alice }), "revert");
	})

	it("should transfer correnct amount of L-ETHup to user for USDC tokens", async () => {
		const [admin, alice] = accounts
		const withdrawalAmount = new BN(500000) // 0.5 L-ETHup
		const decimals = (new BN(10)).pow(await asset0.decimals())
		const price = (new BN(100)).mul(decimals) // 100 USDC

		const poolToken = await LetoToken.at(await pool.token())
		
		let poolBalanceBeforeWithdrawal = await asset0.balanceOf(pool.address)

		await poolToken.approve(pool.address, withdrawalAmount, { from: alice })
		await pool.withdrawal(withdrawalAmount, { from: alice })

		let poolTokenBalance = await poolToken.balanceOf(alice, { from: alice })

		let aliceBalance = await asset0.balanceOf(alice, { from: alice })
		let poolBalanceAfterWithdrawal = await asset0.balanceOf(pool.address)

		assert.equal(
			poolBalanceBeforeWithdrawal.sub(poolBalanceAfterWithdrawal).toString(),
			"50000000000000000000", // 50 USDC
			"Balance USDC isn`t correct"
		);

		assert.equal(
			poolTokenBalance.toString(),
			"500000", // 0.5 L-ETHup
			"Balance L-ETHup isn`t correct"
		);

		assert.equal(
			aliceBalance.toString(),
			"50000000000000999999", // 50.00000000000999999 USDC
			"Balance USDC isn`t correct"
		);

		poolBalanceBeforeWithdrawal = await asset0.balanceOf(pool.address)

		await poolToken.approve(pool.address, withdrawalAmount, { from: alice })
		await pool.withdrawal(withdrawalAmount, { from: alice })

		poolTokenBalance = await poolToken.balanceOf(alice, { from: alice })
		aliceBalance = await asset0.balanceOf(alice, { from: alice })
		poolBalanceAfterWithdrawal = await asset0.balanceOf(pool.address)

		assert.equal(
			poolBalanceBeforeWithdrawal.sub(poolBalanceAfterWithdrawal).toString(),
			"50000000000000000000", // 50 USDC
			"Balance USDC isn`t correct"
		);

		assert.equal(
			poolTokenBalance.toString(),
			"0", // 0 L-ETHup
			"Balance L-ETHup isn`t correct"
		);
	
		assert.equal(
			aliceBalance.toString(),
			"100000000000000999999", // 100.00000000000999999 USDC
			"Balance USDC isn`t correct"
		);
	})
})