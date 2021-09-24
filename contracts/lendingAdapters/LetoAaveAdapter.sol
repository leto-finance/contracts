// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "./../interfaces/ILetoPool.sol";
import "./../interfaces/IAaveLendingPool.sol";
import "./../interfaces/ILetoRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract LetoAaveAdapter {
	ILetoRegistry public registry;
	IAaveLendingPool public lending;

	constructor(address leto_registry_) {
		registry = ILetoRegistry(leto_registry_);
		lending = IAaveLendingPool(registry.getAddress("Aave:LendingPool"));
	}

	struct AaveUserAccountData {
		uint256 totalCollateralETH;
		uint256 totalDebtETH;
		uint256 availableBorrowsETH;
		uint256 currentLiquidationThreshold;
		uint256 ltv;
		uint256 healthFactor;
	}

	function deposit(address asset, uint256 amount) external {
		IERC20Metadata(asset).transferFrom(msg.sender, address(this), amount);
		IERC20Metadata(asset).approve(address(lending), amount);
		lending.deposit(asset, amount, msg.sender, 0);
	}

	function repay(address asset, uint256 amount) external {
		IERC20Metadata(asset).transferFrom(msg.sender, address(this), amount);
		IERC20Metadata(asset).approve(address(lending), amount);
		lending.repay(asset, amount, 1, msg.sender);
	}

	function borrow(address _lending, address asset, uint256 amount) external {
		IAaveLendingPool(_lending).borrow(asset, amount, 1, 0, address(this));
	}

	function withdraw(address _lending, address asset, uint256 amount) external {
		IAaveLendingPool(_lending).withdraw(asset, amount, address(this));
	}

	// Getters

	function lendingPool() external view returns (address) {
		return address(lending);
	}

	function ltv(address pool) external view returns (uint256) {
		return getUserAccountData(pool).ltv;
	}

	function deposited(address pool_) external view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		string memory key = string(abi.encodePacked("Aave:interest_bearing:", IERC20Metadata(pool.asset0()).symbol()));
		IERC20Metadata interest = IERC20Metadata(registry.getAddress(key));

		require(address(interest) != address(0x0), string(abi.encodePacked("LetoAaveAdapter: ", key, " address is not setted")));

		return interest.balanceOf(pool_);
	}

	function borrowed(address pool_) external view returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		string memory key = string(abi.encodePacked("Aave:debt_bearing:", "stable:", IERC20Metadata(pool.asset1()).symbol()));
		IERC20Metadata debt = IERC20Metadata(registry.getAddress(key));

		require(address(debt) != address(0x0), string(abi.encodePacked("LetoAaveAdapter: ", key, " address is not setted")));

		return (debt.balanceOf(pool_) * pool.latestPairPrice()) / 10 ** ((pool.pairPriceDecimals() - IERC20Metadata(pool.asset0()).decimals()) + debt.decimals());
	}

	function availableBorrows(address pool_) external view returns (uint256) {
		AaveUserAccountData memory accountData = getUserAccountData(pool_);
		ILetoPool pool = ILetoPool(pool_);
		IERC20Metadata asset0 = IERC20Metadata(pool.asset0());

		if(keccak256(abi.encodePacked(asset0.symbol())) == keccak256(abi.encodePacked("WETH"))) {
			return accountData.availableBorrowsETH;
		}

		IERC20Metadata asset1 = IERC20Metadata(pool.asset1());

		// FIXME: use price feed asset0/ETH, not pairPrice OR calculate it self
		return toDecimals(accountData.availableBorrowsETH * pool.latestPairPrice(), asset1.decimals() + pool.pairPriceDecimals(), asset0.decimals());
	}

	function toDecimals(uint256 _n, uint256 _d1, uint256 _d2) internal pure returns (uint256) {
		if (_d1 < _d2) {
			return _n * 10 ** (_d2 - _d1);
		} else if (_d1 > _d2) {
			return _n / 10 ** (_d1 - _d2);
		}

		return _n;
	}

	function getUserAccountData(address pool)
		public
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
		) = lending.getUserAccountData(pool);

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