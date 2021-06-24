const LetoToken = artifacts.require("LetoToken");

module.exports = async function (deployer) {
	deployer.deploy(LetoToken, "Leto.finance", "LETO");
};
