import React from "react";

export type TableProps = {
  caption?: string;
  children: React.ReactNode;
};

export function Table({ caption, children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        {caption ? <caption className="table-caption">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}
