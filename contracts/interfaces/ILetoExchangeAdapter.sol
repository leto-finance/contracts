pragma solidity 0.8.4;

interface ILetoExchangeAdapter {
	function swap(address asset0, address asset1, uint256 amountIn, uint256 amountOut) external returns (uint256);
}