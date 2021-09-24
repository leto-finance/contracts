// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "./interfaces/ILetoPool.sol";
import "./LetoFlexibleLeverageStrategy.sol";

contract LetoShortStrategyAdapter is LetoFlexibleLeverageStrategy {

	constructor(address leto_registry_) LetoFlexibleLeverageStrategy(leto_registry_) {}

	function rate(address pool_) public view override returns (uint256) {
		ILetoPool pool = ILetoPool(pool_);
		uint256 decimals_ = 10 ** pool.pairPriceDecimals();
		return (pool.initialRate() * ((pool.latestPairPrice() * decimals_) / pool.initialPairPrice())) / decimals_;
	}
}
