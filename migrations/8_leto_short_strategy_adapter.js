const LetoRegistry = artifacts.require("LetoRegistry");
const LetoShortStrategyAdapter = artifacts.require("LetoShortStrategyAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		letoRegistry.setAddress("Aave:debt_bearing:stable:WETH", "0x4e977830ba4bd783C0BB7F15d3e243f73FF57121");
		return deployer.deploy(LetoShortStrategyAdapter, letoRegistry.address);
	})
};
