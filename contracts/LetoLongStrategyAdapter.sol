pragma solidity 0.8.4;

import "./interfaces/ILetoPool.sol";
import "./interfaces/ILetoToken.sol";

contract LetoLongStrategyAdapter {

	// State changing

	event RebalanceSwapStep(address asset0, address asset1, uint256 amountIn, uint256 amountOut);
	event RebalanceDepositLendingPoolStep(address asset, uint256 amount);

	function rebalance(address pool_) public returns (bool) {
		ILetoPool pool = ILetoPool(pool_);
		ILetoPool.Parameters memory parameters = pool.parameters();

		ILetoToken asset0 = ILetoToken(parameters.asset0);
		uint256 balance0 = asset0.balanceOf(pool_);

		ILetoToken asset1 = ILetoToken(parameters.asset1);

		if (leverage(pool_) < parameters.target_leverage) {
			if (balance0 > 0) {
				uint256 amountOut = pool.swap(parameters.asset0, parameters.asset1, balance0, 0); // FIXME: calculate minimal amount out

				emit RebalanceSwapStep(parameters.asset0, parameters.asset1, balance0, amountOut);

				pool.depositToLendingPool(parameters.asset1, amountOut);

				emit RebalanceDepositLendingPoolStep(parameters.asset1, amountOut);

				pool.borrow(
					parameters.asset0,
					(pool.lendingAdapter().availableBorrows(address(pool.lendingAdapter())) / pool.latestPairPrice()) * (10 ** asset0.decimals())
				);
			}
		}
	}

	// Getters

	function price(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);

		uint256 decimals = 10 ** ILetoToken(pool.bidToken()).decimals();
		uint256 deltaPrice = (uint256(pool.latestPairPrice()) * decimals) / uint256(pool.initialPairPrice());
		uint256 poolTokenInitialPrice = uint256(pool.poolTokenInitialPrice());

		return uint256((poolTokenInitialPrice * deltaPrice) / decimals);
	}

	function calculateRebalancingAmount(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		ILetoPool.Parameters memory parameters = pool.parameters();

		return netValue(pool_) * parameters.target_leverage - deposited(pool_);
	}

	function deposited(address pool_) public view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);

		ILetoPool.Parameters memory parameters = pool.parameters();

		ILetoToken asset0 = ILetoToken(parameters.asset0);
		ILetoToken asset1 = ILetoToken(parameters.asset1);

		uint256 latestPairPrice = uint256(pool.latestPairPrice());

		return (asset0.balanceOf(pool_) * latestPairPrice) / (10 ** asset0.decimals())
					+ asset1.balanceOf(pool_)
					+ pool.lendingAdapter().deposited();
	}

	function borrowedAssets(address pool_) public view returns (uint256) {
		// TODO: integrate with lending market
		return 0;
	}

	function netValue(address pool_) public view returns (uint256) {
		return deposited(pool_) - borrowedAssets(pool_);
	}

	function leverage(address pool_) public view returns (uint256) {
		return deposited(pool_) / netValue(pool_);
	}
}