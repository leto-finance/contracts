const LetoAaveAdapter = artifacts.require("LetoAaveAdapter");

module.exports = async function (deployer) {
	deployer.deploy(LetoAaveAdapter);
};
