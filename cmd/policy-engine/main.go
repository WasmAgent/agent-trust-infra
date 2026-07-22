package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/WasmAgent/agent-trust-infra/trust-policy-engine"
)

func main() {
	exitCode, err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(exitCode)
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) (int, error) {
	if len(args) > 0 && args[0] == benchSubcommand {
		return runBenchCommand(args[1:], stdout, stderr)
	}

	flags := flag.NewFlagSet("policy-engine", flag.ContinueOnError)
	flags.SetOutput(stderr)

	policyPath := flags.String("policy", "", "path to policy DSL JSON")
	artifactPath := flags.String("artifact", "-", "path to trust artifact JSON, or - for stdin")
	format := flags.String("format", "json", "output format: json or text")

	if err := flags.Parse(args); err != nil {
		return 2, err
	}
	if *policyPath == "" {
		return 2, errors.New("missing required -policy")
	}

	policyBytes, err := os.ReadFile(*policyPath)
	if err != nil {
		return 2, fmt.Errorf("read policy: %w", err)
	}
	artifactBytes, err := readInput(*artifactPath, stdin)
	if err != nil {
		return 2, fmt.Errorf("read artifact: %w", err)
	}

	var policy trustpolicyengine.PolicyDocument
	if err := trustpolicyengine.DecodeJSON(policyBytes, &policy); err != nil {
		return 2, fmt.Errorf("parse policy: %w", err)
	}
	if err := trustpolicyengine.ValidatePolicy(policy); err != nil {
		return 2, err
	}

	var artifact any
	if err := trustpolicyengine.DecodeJSON(artifactBytes, &artifact); err != nil {
		return 2, fmt.Errorf("parse artifact: %w", err)
	}

	result, err := trustpolicyengine.EvaluatePolicy(policy, artifact)
	if err != nil {
		return 2, err
	}

	switch *format {
	case "json":
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			return 2, err
		}
	case "text":
		writeTextResult(stdout, result)
	default:
		return 2, fmt.Errorf("unsupported -format %q", *format)
	}

	if !result.Allowed {
		return 1, nil
	}
	return 0, nil
}

func readInput(path string, stdin io.Reader) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(stdin)
	}
	return os.ReadFile(path)
}

func writeTextResult(w io.Writer, result trustpolicyengine.EvaluationResult) {
	status := "allowed"
	if !result.Allowed {
		status = "rejected"
	}
	fmt.Fprintf(w, "%s %s@%s\n", status, result.PolicySetID, result.Version)
	for _, violation := range result.Violations {
		fmt.Fprintf(w, "violation %s: %s\n", violation.RuleID, violation.Message)
	}
	for _, warning := range result.Warnings {
		fmt.Fprintf(w, "warning %s: %s\n", warning.RuleID, warning.Message)
	}
}
