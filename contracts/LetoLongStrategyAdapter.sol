pragma solidity 0.8.4;

import "./interfaces/ILetoPool.sol";
import "./interfaces/ILetoToken.sol";
import "./interfaces/ILetoRegistry.sol";

contract LetoLongStrategyAdapter {
	ILetoRegistry public registry;

	struct PoolState {
		ILetoPool.Parameters parameters;
		uint256 balance0;
		uint256 balance1;
		uint256 deposited;
		uint256 borrowed;
		uint256 netValue;
		uint256 leverage;
	}

	constructor(address leto_registry_) {
		registry = ILetoRegistry(leto_registry_);
	}

	// State changing

	function rebalance(address pool_) public returns (bool) {
		ILetoPool pool = ILetoPool(pool_);
		PoolState memory state = poolState(pool_);

		if (state.balance0 > 0) {
			uint256 amountOut = swap(pool, state);
			deposit(pool, poolState(pool_), amountOut);
		}

		state = poolState(pool_);

		int deviation = int(state.leverage) - int16(state.parameters.target_leverage);
		int maxDeviation = (int16(state.parameters.target_leverage) / 100) * 5;

		if (deviation < 0 && (deviation * -1) > maxDeviation) {
			borrow(pool, poolState(pool_));
			uint256 amountOut = swap(pool, poolState(pool_));
			deposit(pool, poolState(pool_), amountOut);
		} else if (deviation > 0 && deviation > maxDeviation) {
			withdraw(pool, poolState(pool_));
		}
	}

	event RebalanceWithdrawalStep(address asset, uint256 amount);

	function withdraw(ILetoPool pool, PoolState memory state) private returns (uint256 amountOut) {
		uint256 decimals_ = ILetoToken(state.parameters.asset1).decimals();
		uint256 amount = state.deposited - (state.netValue * state.parameters.target_leverage / 10 ** decimals());

		pool.lendingAdapter().withdraw(address(state.parameters.asset1), amount, address(pool));
		amountOut = pool.swap(state.parameters.asset1, state.parameters.asset0, amount, 0); // FIXME: calculate minimal amount out
		pool.repay(state.parameters.asset0, amountOut);

		emit RebalanceWithdrawalStep(state.parameters.asset0, amountOut);
	}

	event RebalanceSwapStep(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(ILetoPool pool, PoolState memory state) private returns (uint256 amountOut) {
		amountOut = pool.swap(state.parameters.asset0, state.parameters.asset1, state.balance0, 0); // FIXME: calculate minimal amount out
		emit RebalanceSwapStep(state.parameters.asset0, state.parameters.asset1, state.balance0, amountOut);
	}

	event RebalanceDepositLendingPoolStep(address asset, uint256 amount);

	function deposit(ILetoPool pool, PoolState memory state, uint256 amount) private returns (bool) {
		pool.depositToLendingPool(state.parameters.asset1, amount);
		emit RebalanceDepositLendingPoolStep(state.parameters.asset1, amount);
	}

	event RebalanceBorrowStep(address asset, uint256 amount);

	function borrow(ILetoPool pool, PoolState memory state) private returns (bool) {
		uint256 rebalancingAmount_ = calculateRebalancingAmount(state.deposited, state.netValue, state.parameters.target_leverage);
		uint256 availableBorrows_ = pool.lendingAdapter().availableBorrows(address(pool.lendingAdapter()));

		if (rebalancingAmount_ > availableBorrows_) {
			rebalancingAmount_ = availableBorrows_;
		}

		ILetoToken asset0 = ILetoToken(state.parameters.asset0);
		uint256 amount = rebalancingAmount_ * 10 ** asset0.decimals() / pool.latestPairPrice();

		pool.borrow(state.parameters.asset0, amount);

		emit RebalanceBorrowStep(state.parameters.asset0, amount);
	}

	// Getters

	function borrowed(address pool_, string memory assetSymbol) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);

		address dAsset = registry.getAddress(
			string(abi.encodePacked("Aave:debt_bearing:","stable:", assetSymbol))
		);

		return pool.lendingAdapter().borrowed(dAsset, address(pool.lendingAdapter()));
	}

	function poolState(address pool_) public view returns (PoolState memory) {
		ILetoPool pool = ILetoPool(pool_);
		ILetoPool.Parameters memory parameters = pool.parameters();

		uint256 latestPairPrice = pool.latestPairPrice();
		uint256 poolDecimals = pool.decimals();

		ILetoToken asset0 = ILetoToken(parameters.asset0);
		ILetoToken asset1 = ILetoToken(parameters.asset1);

		uint256 decimals0 = asset0.decimals();

		uint256 balance0 = asset0.balanceOf(pool_);
		uint256 balance1 = asset1.balanceOf(pool_);

		uint256 borrowedAssets_ = borrowed(pool_, asset0.symbol());

		uint256 borrowedAssetsConverted = (borrowedAssets_ * (10 ** poolDecimals)) / ((10 ** poolDecimals) / latestPairPrice) / (10 ** decimals0);
		uint256 balance0Converted = (balance0 * (10 ** poolDecimals)) / ((10 ** poolDecimals) / latestPairPrice) / (10 ** decimals0);

		uint256 deposited_ = deposited(balance0Converted, balance1, pool.lendingAdapter().deposited());
		uint256 netValue_ = netValue(deposited_, borrowedAssetsConverted);

		return PoolState({
			parameters: parameters,
			balance0: balance0,
			balance1: balance1,
			deposited: deposited_,
			borrowed: borrowedAssetsConverted,
			netValue: netValue_,
			leverage: leverage(deposited_, netValue_)
		});
	}

	function price(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);

		uint256 decimals_ = 10 ** ILetoToken(pool.bidToken()).decimals();
		uint256 deltaPrice = (uint256(pool.latestPairPrice()) * decimals_) / uint256(pool.initialPairPrice());
		uint256 poolTokenInitialPrice = uint256(pool.poolTokenInitialPrice());

		return uint256((poolTokenInitialPrice * deltaPrice) / decimals_);
	}

	function calculateRebalancingAmount(uint256 deposited_, uint256 netValue_, uint16 targetLeverage_) public view returns (uint256) {
		uint256 targetValue_ = netValue_ * targetLeverage_ / 10 ** decimals();

		if (targetValue_ < deposited_) { return 0; }
		return targetValue_ - deposited_;
	}

	function deposited(uint256 balance0, uint256 balance1, uint256 depositedToLendingPool ) public view returns (uint256) {
		return balance0 + balance1 + depositedToLendingPool;
	}

	function netValue(uint256 deposited_, uint256 borrowedAssets_) public view returns (uint256) {
		return deposited_ - borrowedAssets_;
	}

	function leverage(uint256 deposited_, uint256 netValue_) public view returns (uint256) {
		return (deposited_ * (10 ** decimals())) / netValue_;
	}

	function decimals() internal view returns (uint8) {
		return 4;
	}
}