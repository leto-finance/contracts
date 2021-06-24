pragma solidity 0.8.4;

interface ILetoLendingAdapter {
	function deposit(address asset, uint256 amount, address onBehalfOf) external;
	function withdraw(address asset, uint256 amount, address to) external;
	function borrow(address asset, uint256 amount, address onBehalfOf) external;
	function repay(address asset, uint256 amount, address onBehalfOf) external;
	function deposited() external view returns (uint256);
	function ltv(address user) external view returns (uint256);
	function availableBorrows(address user) external view returns (uint256);
	function borrowed(address user) external view returns (uint256);
}