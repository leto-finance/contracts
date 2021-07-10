pragma solidity 0.8.4;

import "./ILetoPool.sol";

interface ILetoStrategyAdapter {
	struct PoolState {
		ILetoPool.Parameters parameters;
		uint256 balance0;
		uint256 balance1;
		uint256 deposited;
		uint256 borrowed;
		uint256 netValue;
		uint256 leverage;
	}

	function price(address pool) external view returns (uint256);
	function poolState(address pool) external view returns (PoolState memory);
}