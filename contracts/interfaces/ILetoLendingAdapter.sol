// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

interface ILetoLendingAdapter {
	function deposit(address asset, uint256 amount) external;
	function withdraw(address lending, address asset, uint256 amount) external;
	function borrow(address lending, address asset, uint256 amount) external;
	function repay(address asset, uint256 amount) external;
	function lendingPool() external view returns (address);
	function deposited(address pool) external view returns (uint256);
	function ltv(address pool) external view returns (uint256);
	function availableBorrows(address pool) external view returns (uint256);
	function borrowed(address pool) external view returns (uint256);
}