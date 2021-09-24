// SPDX-License-Identifier: Apache-2.0

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

	// State changing
	function rebalance(address pool_, uint256 minimalAmountAsset0, uint256 minimalAmountAsset1) external;

	// Getters
	function calculateMaxWithdrawal(address pool_) external view returns (uint256);
	function poolState(address pool_) external view returns (PoolState memory);
	function rate(address pool_) external view returns (uint256);
}