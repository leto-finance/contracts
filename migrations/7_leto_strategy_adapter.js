const LetoRegistry = artifacts.require("LetoRegistry");
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		return deployer.deploy(LetoLongStrategyAdapter, letoRegistry.address);
	})
};
