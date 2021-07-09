// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8;

contract Memory {
    function memory_sample() public pure {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0xdeadbeaf)
            mstore(ptr, add(mload(ptr), 0xfaceb00c))
            mstore(add(ptr, 0x20), 0xcafeb0ba)
        }
    }
}
