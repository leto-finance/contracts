// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract LetoPriceConsumer {
	/**
	* @notice returns the latest price
	*/
	function getPrice(address aggregator) public view returns (int) {
		AggregatorV3Interface priceFeed = AggregatorV3Interface(aggregator);
		(,int price,,,) = priceFeed.latestRoundData();
		return price;
	}

	/**
   * @notice represents the number of decimals the aggregator responses represent.
   */
	function getPriceDecimals(address aggregator) public view returns (uint8) {
		AggregatorV3Interface priceFeed = AggregatorV3Interface(aggregator);
		return priceFeed.decimals();
	}
}