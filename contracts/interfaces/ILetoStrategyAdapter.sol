pragma solidity 0.8.4;

interface ILetoStrategyAdapter {
	function price(address pool) external view returns (uint256);
}