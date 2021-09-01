pragma solidity 0.8.4;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract AggregatorV3Mock {

    int private _latestPrice;

    /**
     * Returns the latest price
     */
    function latestRoundData()
      public
      view
      returns (
        uint80 roundID,
        int price,
        uint startedAt,
        uint timeStamp,
        uint80 answeredInRound
    ) {
      roundID = 0;
      price = _latestPrice;
      startedAt = 0;
      timeStamp = 0;
      answeredInRound = 0;
    }

    function setPrice(int latestPrice_) public {
      _latestPrice = latestPrice_;
    }

    function decimals()
      public
      view
      returns (uint8)
    {
      return 8;
    }
}
