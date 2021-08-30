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
	asm := gethutil.NewAssembly().Add(0xdeadbeef, 0xcafeb0ba).Sub(0xfaceb00c, 0xb0bacafe)
	contracts := []gethutil.Contract{{Address: address, Asm: asm}}

	logs, err := gethutil.Trace(address, nil, &runtime.Config{GasLimit: 100}, contracts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}

	bytes, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}

	ioutil.WriteFile("./output/add_sub.json", bytes, 0644)
}
