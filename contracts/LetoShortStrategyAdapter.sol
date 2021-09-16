pragma solidity 0.8.4;

import "./interfaces/ILetoPool.sol";
import "./interfaces/ILetoToken.sol";
import "./interfaces/ILetoRegistry.sol";

contract LetoShortStrategyAdapter {
	ILetoRegistry public registry;

	int _deviation = 5;

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
			deposit(pool, poolState(pool_), state.balance0);
		}

		state = poolState(pool_);

		int deviation;
		int maxDeviation;

		(deviation, maxDeviation) = calculateTargetLeverageDeviation(pool_, state);

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
		uint256 amount = state.deposited - (state.netValue * state.parameters.target_leverage / 10 ** decimals());

		pool.withdraw(state.parameters.asset0, amount);
		amountOut = pool.swap(state.parameters.asset0, state.parameters.asset1, amount, 0); // FIXME: calculate minimal amount out
		pool.repay(state.parameters.asset1, amountOut);

		emit RebalanceWithdrawalStep(state.parameters.asset1, amount);
	}

	event RebalanceSwapStep(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(ILetoPool pool, PoolState memory state) private returns (uint256 amountOut) {
		amountOut = pool.swap(state.parameters.asset1, state.parameters.asset0, state.balance1, 0); // FIXME: calculate minimal amount out
		emit RebalanceSwapStep(state.parameters.asset1, state.parameters.asset0, state.balance1, amountOut);
	}

	event RebalanceDepositLendingPoolStep(address asset, uint256 amount);

	function deposit(ILetoPool pool, PoolState memory state, uint256 amount) private returns (bool) {
		pool.depositToLendingPool(state.parameters.asset0, amount);
		emit RebalanceDepositLendingPoolStep(state.parameters.asset0, amount);
	}

	event RebalanceBorrowStep(address asset, uint256 amount);

	function borrow(ILetoPool pool, PoolState memory state) private returns (bool) {
		uint256 rebalancingAmount_ = calculateRebalancingAmount(state.deposited, state.netValue, state.parameters.target_leverage);
		uint256 availableBorrows_ = pool.lendingAdapter().availableBorrows(address(pool));

		if (rebalancingAmount_ > availableBorrows_) {
			rebalancingAmount_ = availableBorrows_;
		}

		ILetoToken asset0 = ILetoToken(state.parameters.asset0);
		ILetoToken asset1 = ILetoToken(state.parameters.asset1);

		rebalancingAmount_ = toDecimals(rebalancingAmount_, asset0.decimals(), asset1.decimals() + pool.pairPriceDecimals());

		uint256 amount = rebalancingAmount_ / pool.latestPairPrice();

		pool.borrow(state.parameters.asset1, amount);

		emit RebalanceBorrowStep(state.parameters.asset1, pool.lendingAdapter().borrowed(address(pool)));
	}

	// Pure

	function toDecimals(uint256 _n, uint256 _d1, uint256 _d2) internal pure returns (uint256) {
		if (_d1 < _d2) {
			return _n * 10 ** (_d2 - _d1);
		} else if (_d1 > _d2) {
			return _n / 10 ** (_d1 - _d2);
		}

		return _n;
	}

	// Getters
	function calculateTargetLeverageDeviation(address pool_, PoolState memory state) public view returns (int deviation, int maxDeviation) {
		deviation = int(state.leverage) - int16(state.parameters.target_leverage);
		maxDeviation = (int16(state.parameters.target_leverage) / 100) * _deviation;
	}

	function calculateMaxWithdrawal(address pool_) public view returns (uint256) {
		PoolState memory state = poolState(pool_);
		uint256 _ltv = ltv(pool_);
		if (_ltv == 0) { return 0; }

		int deviation;
		int maxDeviation;

		(deviation, maxDeviation) = calculateTargetLeverageDeviation(pool_, state);

		if (
			deviation < 0 && (deviation * -1) > maxDeviation ||
			deviation > 0 && deviation > maxDeviation
		) {
			return state.deposited - ((state.borrowed * (10 ** 4)) / _ltv);
		}

		return state.netValue * 75 / 100;
	}

	function ltv(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		return pool.lendingAdapter().ltv(address(pool));
	}

	function poolState(address pool_) public view returns (PoolState memory) {
		ILetoPool pool = ILetoPool(pool_);
		ILetoPool.Parameters memory parameters = pool.parameters();

		ILetoToken asset0 = ILetoToken(parameters.asset0);
		ILetoToken asset1 = ILetoToken(parameters.asset1);

		uint256 balance0 = asset0.balanceOf(pool_);
		uint256 balance1 = asset1.balanceOf(pool_);

		uint256 deposited_ = balance0 + pool.lendingAdapter().deposited(address(pool));
		uint256 borrowedAssets_ = pool.lendingAdapter().borrowed(address(pool));

		uint256 netValue_ = netValue(deposited_, borrowedAssets_);

		return PoolState({
			parameters: parameters,
			balance0:   balance0,
			balance1:   balance1,
			netValue:   netValue_,
			deposited:  deposited_,
			borrowed:   borrowedAssets_,
			leverage:   leverage(deposited_, netValue_)
		});
	}

	function rate(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		uint256 decimals_ = 10 ** pool.pairPriceDecimals();
		return (pool.initialRate() * ((pool.initialPairPrice() * decimals_) / pool.latestPairPrice())) / decimals_;
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
		if (netValue_ == 0) return 0;
		return (deposited_ * (10 ** decimals())) / netValue_;
	}

	function decimals() internal view returns (uint8) {
		return 4;
	}
}