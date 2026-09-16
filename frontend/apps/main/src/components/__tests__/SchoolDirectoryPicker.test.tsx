import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient, SchoolLookup } from "@api";
import {
  SchoolDirectoryPicker,
  type SchoolSelectionValue
} from "../SchoolDirectoryPicker";

const regions = [
  { id: 1, name: "Москва", country_code: "RU", is_other: false },
  { id: 2, name: "Санкт-Петербург", country_code: "RU", is_other: false },
  { id: 3, name: "Другой регион / другая страна", country_code: null, is_other: true }
];

const school: SchoolLookup = {
  id: 10,
  short_name: "Лицей № 1",
  full_name: "ГБОУ Лицей № 1",
  city: "Москва"
};

function makeClient(schools = vi.fn().mockResolvedValue([school])): ApiClient {
  return {
    lookup: {
      regions: vi.fn().mockResolvedValue(regions),
      schools
    }
  } as unknown as ApiClient;
}

function Harness({ client, classGrade = "5" }: { client: ApiClient; classGrade?: string }) {
  const [value, setValue] = useState<SchoolSelectionValue>({
    regionId: null,
    schoolId: null,
    schoolQuery: "",
    schoolCity: "",
    schoolNotFound: false
  });
  return (
    <>
      <SchoolDirectoryPicker
        client={client}
        value={value}
        onChange={setValue}
        role="student"
        classGrade={classGrade}
        idPrefix="test"
      />
      <output data-testid="selection">{JSON.stringify(value)}</output>
    </>
  );
}

describe("SchoolDirectoryPicker", () => {
  it("loads regions and selects a school with its city but without its address", async () => {
    const client = makeClient();
    render(<Harness client={client} />);

    const region = await screen.findByLabelText("Регион");
    fireEvent.change(region, { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Школа" }), { target: { value: "ли" } });

    const option = await screen.findByRole("button", { name: /Лицей № 1.*Москва/i }, { timeout: 1200 });
    expect(screen.queryByText(/улица/i)).toBeNull();
    fireEvent.click(option);

    expect(screen.getByText("Город: Москва")).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent('"schoolId":10');
  });

  it("clears the selected school when the region changes", async () => {
    render(<Harness client={makeClient()} />);
    const region = await screen.findByLabelText("Регион");
    fireEvent.change(region, { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Школа" }), { target: { value: "ли" } });
    fireEvent.click(await screen.findByRole("button", { name: /Лицей № 1.*Москва/i }, { timeout: 1200 }));

    fireEvent.change(region, { target: { value: "2" } });
    expect(screen.getByRole("combobox", { name: "Школа" })).toHaveValue("");
    expect(screen.getByTestId("selection")).toHaveTextContent('"schoolId":null');
  });

  it("does not treat arbitrary input as a selected school and aborts a stale search", async () => {
    const signals: AbortSignal[] = [];
    const schools = vi.fn(({ signal }: { signal?: AbortSignal }) => {
      if (signal) signals.push(signal);
      return new Promise<SchoolLookup[]>(() => undefined);
    });
    render(<Harness client={makeClient(schools)} />);
    fireEvent.change(await screen.findByLabelText("Регион"), { target: { value: "1" } });
    const input = screen.getByRole("combobox", { name: "Школа" });
    fireEvent.change(input, { target: { value: "ли" } });
    await waitFor(() => expect(schools).toHaveBeenCalledTimes(1), { timeout: 1200 });
    fireEvent.change(input, { target: { value: "лицей" } });

    expect(signals[0].aborted).toBe(true);
    expect(screen.getByTestId("selection")).toHaveTextContent('"schoolId":null');
  });

  it("loads the next page when more matching schools are available", async () => {
    const matchingSchools = Array.from({ length: 22 }, (_, index): SchoolLookup => ({
      id: index + 1,
      short_name: `Школа № ${index + 1}`,
      full_name: `ГБОУ Школа № ${index + 1}`,
      city: "Москва"
    }));
    const schools = vi.fn(({ offset = 0 }: { offset?: number }) =>
      Promise.resolve(matchingSchools.slice(offset, offset + 21))
    );
    render(<Harness client={makeClient(schools)} />);

    fireEvent.change(await screen.findByLabelText("Регион"), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Школа" }), { target: { value: "шк" } });

    const showMore = await screen.findByRole("button", { name: "Показать еще" }, { timeout: 1200 });
    expect(screen.queryByText("Школа № 21")).toBeNull();
    fireEvent.click(showMore);

    expect(await screen.findByText("Школа № 21")).toBeInTheDocument();
    expect(screen.getByText("Школа № 22")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Показать еще" })).toBeNull();
    expect(schools).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 21, offset: 20, query: "шк", regionId: 1 })
    );
  });

  it("hides school controls for a preschooler", async () => {
    render(<Harness client={makeClient()} classGrade="0" />);
    await screen.findByLabelText("Регион");
    expect(screen.queryByRole("combobox", { name: "Школа" })).toBeNull();
    expect(screen.queryByText("Моей школы нет в списке")).toBeNull();
    expect(screen.getByText("Для дошкольника выбор школы не требуется.")).toBeInTheDocument();
  });
});
