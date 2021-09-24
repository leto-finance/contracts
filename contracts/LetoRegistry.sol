// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract LetoRegistry is Ownable {
	mapping(string => address) public addresses;

	function getAddress(string memory key_) external view returns (address) {
		return addresses[key_];
	}

	function setAddress(string memory key_, address address_) external onlyOwner {
		addresses[key_] = address_;
	}
}