const LetoRegistry = artifacts.require("LetoRegistry");
const LetoShortStrategyAdapter = artifacts.require("LetoShortStrategyAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		return deployer.deploy(LetoShortStrategyAdapter, letoRegistry.address);
	})
};
