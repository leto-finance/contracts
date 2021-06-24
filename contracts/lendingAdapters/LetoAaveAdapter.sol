pragma solidity 0.8.4;

import "./../interfaces/IAaveLendingPool.sol";
import "./../interfaces/ILetoToken.sol";

contract LetoAaveAdapter {
	// FIXME: get this address from registry
	IAaveLendingPool lending = IAaveLendingPool(0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9);

	struct AaveUserAccountData {
		uint256 totalCollateralETH;
		uint256 totalDebtETH;
		uint256 availableBorrowsETH;
		uint256 currentLiquidationThreshold;
		uint256 ltv;
		uint256 healthFactor;
	}

	function deposit(address asset_, uint256 amount, address onBehalfOf) external {
		ILetoToken asset = ILetoToken(asset_);
		asset.transferFrom(msg.sender, address(this), amount);
		asset.approve(address(lending), amount);

		lending.deposit(asset_, amount, onBehalfOf, 0);
	}

	function withdraw(address asset, uint256 amount, address to) external {
		lending.withdraw(asset, amount, to);
	}

	function borrow(address asset_, uint256 amount, address onBehalfOf) external {
		lending.borrow(asset_, amount, 1, 0, onBehalfOf);
		ILetoToken(asset_).transfer(msg.sender, amount);
	}

	function repay(address asset, uint256 amount, address onBehalfOf) external {
		lending.repay(asset, amount, 1, onBehalfOf);
	}

	function deposited() external view returns (uint256) {
		AaveUserAccountData memory accountData = getUserAccountData(address(this));
		return accountData.totalCollateralETH;
	}

	function ltv(address user) external view returns (uint256) {
		AaveUserAccountData memory accountData = getUserAccountData(user);
		return accountData.ltv;
	}

	function borrowed(address user) external view returns (uint256) {
		return ILetoToken(0x619beb58998eD2278e08620f97007e1116D5D25b).balanceOf(user);
	}

	function availableBorrows(address user) external view returns (uint256) {
		AaveUserAccountData memory accountData = getUserAccountData(user);
		return accountData.availableBorrowsETH;
	}


	function getUserAccountData(address user)
		internal
		view
		returns (AaveUserAccountData memory)
	{
		(
			uint256 totalCollateralETH_,
			uint256 totalDebtETH_,
			uint256 availableBorrowsETH_,
			uint256 currentLiquidationThreshold_,
			uint256 ltv_,
			uint256 healthFactor_
		) = lending.getUserAccountData(user);

		return AaveUserAccountData({
			totalCollateralETH:          totalCollateralETH_,
			totalDebtETH:                totalDebtETH_,
			availableBorrowsETH:         availableBorrowsETH_,
			currentLiquidationThreshold: currentLiquidationThreshold_,
			ltv:                         ltv_,
			healthFactor:                healthFactor_
		});
	}
}