// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ILetoPool.sol";
import "./interfaces/ILetoRegistry.sol";
import "./interfaces/ILetoStrategyAdapter.sol";

abstract contract LetoFlexibleLeverageStrategy is ILetoStrategyAdapter {
	ILetoRegistry public registry;

	int _deviation = 5;

	constructor(address leto_registry_) {
		registry = ILetoRegistry(leto_registry_);
	}

	// State changing

	function rebalance(address pool_, uint256 minDeposited, uint256 minBorrowed) external virtual override {
		ILetoPool pool = ILetoPool(pool_);

		uint256 balance0 = IERC20(pool.asset0()).balanceOf(pool_);

		if (balance0 > 0) {
			deposit(pool, balance0);
		}

		int deviation;
		int maxDeviation;

		uint256 deposited_ = deposited(pool);
		uint256 netValue_ = netValue(deposited_, pool.lendingAdapter().borrowed(pool_));
		uint16 targetLeverage = pool.targetLeverage();

		(deviation, maxDeviation) = calculateTargetLeverageDeviation(leverage(deposited_, netValue_), targetLeverage);

		if (deviation < 0 && (deviation * -1) > maxDeviation) {
			borrow(pool, deposited_, netValue_, targetLeverage);
			deposit(pool, swap(pool, IERC20(pool.asset1()).balanceOf(pool_)));
		} else if (deviation > 0 && deviation > maxDeviation) {
			withdraw(pool, deposited_, netValue_, targetLeverage);
		}

		require(deposited(pool) >= minDeposited, "LetoFlexibleLeverageStrategy: Too little deposited amount");
		require(pool.lendingAdapter().borrowed(pool_) >= minBorrowed, "LetoFlexibleLeverageStrategy: Too little borrowed amount");
	}

	event RebalanceWithdrawalStep(address asset, uint256 amount);

	function withdraw(ILetoPool pool, uint256 deposited, uint256 netValue, uint256 targetLeverage) private returns (uint256 amountOut) {
		uint256 amount = deposited - (netValue * targetLeverage / 10 ** decimals());

		pool.withdraw(pool.asset0(), amount);
		amountOut = pool.swap(pool.asset0(), pool.asset1(), amount, 0);
		pool.repay(pool.asset1(), amountOut);

		emit RebalanceWithdrawalStep(pool.asset1(), amount);
	}

	event RebalanceSwapStep(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(ILetoPool pool, uint256 amountIn) private returns (uint256 amountOut) {
		amountOut = pool.swap(pool.asset1(), pool.asset0(), amountIn, 0);
		emit RebalanceSwapStep(pool.asset1(), pool.asset0(), amountIn, amountOut);
	}

	event RebalanceDepositLendingPoolStep(address asset, uint256 amount);

	function deposit(ILetoPool pool, uint256 amount) private {
		pool.depositToLendingPool(pool.asset0(), amount);
		emit RebalanceDepositLendingPoolStep(pool.asset0(), amount);
	}

	event RebalanceBorrowStep(address asset, uint256 amount);

	function borrow(ILetoPool pool, uint256 deposited, uint256 netValue, uint16 targetLeverage) private {
		uint256 rebalancingAmount_ = calculateRebalancingAmount(deposited, netValue, targetLeverage);
		uint256 availableBorrows_ = pool.lendingAdapter().availableBorrows(address(pool));
		address asset1_ = pool.asset1();

		if (rebalancingAmount_ > availableBorrows_) {
			rebalancingAmount_ = availableBorrows_;
		}

		IERC20Metadata asset0 = IERC20Metadata(pool.asset0());
		IERC20Metadata asset1 = IERC20Metadata(asset1_);

		rebalancingAmount_ = toDecimals(rebalancingAmount_, asset0.decimals(), asset1.decimals() + pool.pairPriceDecimals());

		uint256 amount = rebalancingAmount_ / pool.latestPairPrice();

		pool.borrow(asset1_, amount);

		emit RebalanceBorrowStep(asset1_, pool.lendingAdapter().borrowed(address(pool)));
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

	function rate(address pool_) public view virtual override returns (uint256);

	function poolState(address pool_) public view virtual override returns (PoolState memory) {
		ILetoPool pool = ILetoPool(pool_);
		ILetoPool.Parameters memory parameters = pool.parameters();

		IERC20 asset0 = IERC20(parameters.asset0);
		IERC20 asset1 = IERC20(parameters.asset1);

		uint256 balance0 = asset0.balanceOf(pool_);
		uint256 balance1 = asset1.balanceOf(pool_);

		uint256 deposited_ = deposited(pool);
		uint256 borrowedAssets_ = pool.lendingAdapter().borrowed(address(pool));

		uint256 netValue_ = netValue(deposited_, borrowedAssets_);

		return PoolState({
			parameters: parameters,
			balance0:   balance0,
			balance1:   balance1,
			netValue:   netValue_,
			deposited:  deposited_,
			borrowed:   borrowedAssets_,
			leverage:   leverage(deposited_, netValue_),
			totalSupply: IERC20(pool.token()).totalSupply()
		});
	}

	function deposited(ILetoPool pool) internal view returns (uint256) {
		return IERC20(pool.asset0()).balanceOf(address(pool)) + pool.lendingAdapter().deposited(address(pool));
	}

	function calculateMaxWithdrawal(address pool_) public view virtual override returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);

		uint256 _ltv = ltv(pool_);
		if (_ltv == 0) { return 0; }

		int deviation;
		int maxDeviation;

		uint256 deposited_ = deposited(pool);
		uint256 borrowed_ = pool.lendingAdapter().borrowed(address(pool));
		uint256 netValue_ = netValue(deposited_, borrowed_);

		(deviation, maxDeviation) = calculateTargetLeverageDeviation(leverage(deposited_, netValue_), pool.targetLeverage());

		if (
			deviation < 0 && (deviation * -1) > maxDeviation ||
			deviation > 0 && deviation > maxDeviation
		) {
			return deposited_ - ((borrowed_ * (10 ** 4)) / _ltv);
		}

		return netValue_ * 75 / 100;
	}

	function calculateTargetLeverageDeviation(uint256 _leverage, uint16 targetLeverage) internal view returns (int deviation, int maxDeviation) {
		deviation = int(_leverage) - int16(targetLeverage);
		maxDeviation = (int16(targetLeverage) / 100) * _deviation;
	}

	function calculateRebalancingAmount(uint256 deposited_, uint256 netValue_, uint16 targetLeverage_) internal pure returns (uint256) {
		uint256 targetValue_ = netValue_ * targetLeverage_ / 10 ** decimals();

		if (targetValue_ < deposited_) { return 0; }
		return targetValue_ - deposited_;
	}

	function netValue(uint256 deposited_, uint256 borrowedAssets_) internal pure returns (uint256) {
		return deposited_ - borrowedAssets_;
	}

	function ltv(address pool_) internal view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		return pool.lendingAdapter().ltv(address(pool));
	}

	function leverage(uint256 deposited_, uint256 netValue_) internal pure returns (uint256) {
		if (netValue_ == 0) return 0;
		return (deposited_ * (10 ** decimals())) / netValue_;
	}

	function decimals() internal pure returns (uint8) {
		return 4;
	}
}