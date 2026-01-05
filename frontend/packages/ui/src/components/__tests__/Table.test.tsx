import React from "react";
import { render, screen } from "@testing-library/react";
import { Table } from "@ui";
import { describe, expect, it } from "vitest";

describe("Table", () => {
  it("renders caption and cells", () => {
    render(
      <Table caption="Results">
        <thead>
          <tr>
            <th>Student</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anna</td>
          </tr>
        </tbody>
      </Table>
    );

    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
  });
});
