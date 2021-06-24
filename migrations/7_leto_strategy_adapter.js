const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

module.exports = async function (deployer) {
	deployer.deploy(LetoLongStrategyAdapter);
};
