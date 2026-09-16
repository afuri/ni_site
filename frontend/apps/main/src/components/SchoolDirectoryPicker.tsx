import React, { useEffect, useRef, useState } from "react";
import type { ApiClient, RegionLookup, SchoolLookup } from "@api";
import "../styles/school-directory-picker.css";

export type SchoolSelectionValue = {
  regionId: number | null;
  schoolId: number | null;
  schoolQuery: string;
  schoolCity: string;
  schoolNotFound: boolean;
};

type SchoolDirectoryPickerProps = {
  client: ApiClient;
  value: SchoolSelectionValue;
  onChange: (value: SchoolSelectionValue) => void;
  role: "student" | "teacher";
  classGrade: string;
  regionError?: string;
  schoolError?: string;
  idPrefix: string;
  disabled?: boolean;
};

const EMPTY_SCHOOL = {
  schoolId: null,
  schoolQuery: "",
  schoolCity: ""
};

const SCHOOL_PAGE_SIZE = 20;

export function SchoolDirectoryPicker({
  client,
  value,
  onChange,
  role,
  classGrade,
  regionError,
  schoolError,
  idPrefix,
  disabled = false
}: SchoolDirectoryPickerProps) {
  const [regions, setRegions] = useState<RegionLookup[]>([]);
  const [regionsStatus, setRegionsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [schools, setSchools] = useState<SchoolLookup[]>([]);
  const [schoolsStatus, setSchoolsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [hasMoreSchools, setHasMoreSchools] = useState(false);
  const [moreSchoolsStatus, setMoreSchoolsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isListOpen, setIsListOpen] = useState(false);
  const requestSequence = useRef(0);
  const moreSchoolsController = useRef<AbortController | null>(null);
  const isPreschool = role === "student" && classGrade === "0";
  const selectedRegion = regions.find((region) => region.id === value.regionId) ?? null;
  const searchDisabled = disabled || isPreschool || value.schoolNotFound || selectedRegion?.is_other === true;
  const listboxId = `${idPrefix}-school-listbox`;

  useEffect(() => {
    const controller = new AbortController();
    setRegionsStatus("loading");
    client.lookup
      .regions({ limit: 100, signal: controller.signal })
      .then((items) => {
        setRegions(items);
        setRegionsStatus("ready");
      })
      .catch((error) => {
        if ((error as Error)?.name !== "AbortError") {
          setRegionsStatus("error");
        }
      });
    return () => controller.abort();
  }, [client]);

  useEffect(() => {
    requestSequence.current += 1;
    const sequence = requestSequence.current;
    moreSchoolsController.current?.abort();
    moreSchoolsController.current = null;
    setHasMoreSchools(false);
    setMoreSchoolsStatus("idle");
    const query = value.schoolQuery.trim();
    if (searchDisabled || value.regionId === null || value.schoolId !== null || query.length < 2) {
      setSchools([]);
      setSchoolsStatus("idle");
      setIsListOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSchoolsStatus("loading");
      client.lookup
        .schools({
          regionId: value.regionId as number,
          query,
          limit: SCHOOL_PAGE_SIZE + 1,
          offset: 0,
          signal: controller.signal
        })
        .then((items) => {
          if (requestSequence.current !== sequence) {
            return;
          }
          setSchools(items.slice(0, SCHOOL_PAGE_SIZE));
          setHasMoreSchools(items.length > SCHOOL_PAGE_SIZE);
          setSchoolsStatus("idle");
          setIsListOpen(true);
        })
        .catch((error) => {
          if ((error as Error)?.name === "AbortError" || requestSequence.current !== sequence) {
            return;
          }
          setSchools([]);
          setHasMoreSchools(false);
          setSchoolsStatus("error");
          setIsListOpen(true);
        });
    }, 275);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, searchDisabled, value.regionId, value.schoolId, value.schoolQuery]);

  const loadMoreSchools = () => {
    const query = value.schoolQuery.trim();
    if (
      moreSchoolsStatus === "loading" ||
      !hasMoreSchools ||
      value.regionId === null ||
      query.length < 2
    ) {
      return;
    }

    const sequence = requestSequence.current;
    const controller = new AbortController();
    moreSchoolsController.current?.abort();
    moreSchoolsController.current = controller;
    setMoreSchoolsStatus("loading");

    client.lookup
      .schools({
        regionId: value.regionId,
        query,
        limit: SCHOOL_PAGE_SIZE + 1,
        offset: schools.length,
        signal: controller.signal
      })
      .then((items) => {
        if (requestSequence.current !== sequence) {
          return;
        }
        const nextSchools = items.slice(0, SCHOOL_PAGE_SIZE);
        setSchools((current) => {
          const currentIds = new Set(current.map((school) => school.id));
          return [...current, ...nextSchools.filter((school) => !currentIds.has(school.id))];
        });
        setHasMoreSchools(items.length > SCHOOL_PAGE_SIZE);
        setMoreSchoolsStatus("idle");
      })
      .catch((error) => {
        if ((error as Error)?.name === "AbortError" || requestSequence.current !== sequence) {
          return;
        }
        setMoreSchoolsStatus("error");
      });
  };

  const handleRegionChange = (rawValue: string) => {
    const regionId = rawValue ? Number(rawValue) : null;
    const region = regions.find((item) => item.id === regionId);
    onChange({
      regionId,
      ...EMPTY_SCHOOL,
      schoolNotFound: region?.is_other === true
    });
    setSchools([]);
    setHasMoreSchools(false);
    setIsListOpen(false);
  };

  const handleSchoolQueryChange = (query: string) => {
    onChange({
      ...value,
      schoolId: null,
      schoolQuery: query,
      schoolCity: ""
    });
  };

  const selectSchool = (school: SchoolLookup) => {
    onChange({
      ...value,
      schoolId: school.id,
      schoolQuery: school.short_name,
      schoolCity: school.city,
      schoolNotFound: false
    });
    setSchools([]);
    setHasMoreSchools(false);
    setIsListOpen(false);
  };

  const toggleNotFound = (checked: boolean) => {
    onChange({
      ...value,
      ...EMPTY_SCHOOL,
      schoolNotFound: checked
    });
    setSchools([]);
    setHasMoreSchools(false);
    setIsListOpen(false);
  };

  return (
    <div className="school-picker">
      <label className="field" htmlFor={`${idPrefix}-region`}>
        <span className="field-label">Регион</span>
        <select
          id={`${idPrefix}-region`}
          name="regionId"
          className={`field-input ${regionError ? "field-input-error" : ""}`.trim()}
          value={value.regionId ?? ""}
          onChange={(event) => handleRegionChange(event.target.value)}
          disabled={disabled || regionsStatus === "loading"}
        >
          <option value="">Выберите регион</option>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        {regionsStatus === "loading" ? <span className="field-helper">Загрузка регионов…</span> : null}
        {regionsStatus === "error" ? (
          <span className="field-helper field-helper-error">Не удалось загрузить регионы.</span>
        ) : null}
        {regionError ? <span className="field-helper field-helper-error">{regionError}</span> : null}
      </label>

      {isPreschool ? (
        <p className="school-picker-note">Для дошкольника выбор школы не требуется.</p>
      ) : (
        <>
          {selectedRegion?.is_other ? (
            <p className="school-picker-note">Школу можно будет отправить на добавление из личного кабинета.</p>
          ) : (
            <div className="field school-picker-combobox">
              <label className="field-label" htmlFor={`${idPrefix}-school`}>
                Школа
              </label>
              <input
                id={`${idPrefix}-school`}
                name="schoolQuery"
                className={`field-input ${schoolError ? "field-input-error" : ""}`.trim()}
                value={value.schoolQuery}
                onChange={(event) => handleSchoolQueryChange(event.target.value)}
                onFocus={() => schools.length > 0 && setIsListOpen(true)}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isListOpen}
                aria-controls={listboxId}
                placeholder="Введите не менее двух символов"
                disabled={searchDisabled || value.regionId === null}
              />
              {value.schoolCity ? (
                <span className="field-helper">Город: {value.schoolCity}</span>
              ) : value.schoolId !== null ? (
                <span className="field-helper">Школа выбрана.</span>
              ) : null}
              {schoolsStatus === "loading" ? <span className="field-helper">Поиск…</span> : null}
              {schoolError ? <span className="field-helper field-helper-error">{schoolError}</span> : null}
              {isListOpen ? (
                <ul className="school-picker-list" id={listboxId} role="listbox">
                  {schools.map((school) => (
                    <li key={school.id} role="option" aria-selected={school.id === value.schoolId}>
                      <button type="button" onClick={() => selectSchool(school)}>
                        <strong>{school.short_name}</strong>
                        <span>{school.city}</span>
                        {school.full_name !== school.short_name ? <small>{school.full_name}</small> : null}
                      </button>
                    </li>
                  ))}
                  {schools.length === 0 && schoolsStatus === "idle" ? <li className="school-picker-empty">Ничего не найдено.</li> : null}
                  {schoolsStatus === "error" ? <li className="school-picker-empty">Ошибка поиска. Попробуйте ещё раз.</li> : null}
                  {hasMoreSchools ? (
                    <li className="school-picker-more" role="presentation">
                      <button
                        type="button"
                        onClick={loadMoreSchools}
                        disabled={moreSchoolsStatus === "loading"}
                      >
                        {moreSchoolsStatus === "loading" ? "Загрузка…" : "Показать еще"}
                      </button>
                    </li>
                  ) : null}
                  {moreSchoolsStatus === "error" ? (
                    <li className="school-picker-more-error" role="presentation">
                      Не удалось загрузить школы. Попробуйте ещё раз.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          )}

          {!selectedRegion?.is_other ? (
            <label className="school-picker-missing">
              <input
                type="checkbox"
                checked={value.schoolNotFound}
                onChange={(event) => toggleNotFound(event.target.checked)}
                disabled={disabled || value.regionId === null}
              />
              <span>Моей школы нет в списке</span>
            </label>
          ) : null}
        </>
      )}
    </div>
  );
}
