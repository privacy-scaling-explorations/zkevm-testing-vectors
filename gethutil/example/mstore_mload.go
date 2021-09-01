package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/vm/runtime"

	"gethutil"
)

func main() {
	address := common.BytesToAddress([]byte{0xff})
	asm := gethutil.NewAssembly().MStore(0x40, 0x80).MLoad(0x40)
	contracts := []gethutil.Contract{{Address: address, Bytecode: asm.Bytecode}}

	logs, err := gethutil.TraceTx(address, nil, &runtime.Config{GasLimit: 100}, contracts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}

	bytes, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}

	ioutil.WriteFile("./output/mstore_mload.json", bytes, 0644)
}
