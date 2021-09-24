// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

interface ILetoRegistry {
	function getAddress(string memory key_) external view returns (address);
}