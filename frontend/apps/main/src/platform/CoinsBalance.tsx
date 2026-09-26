import React, { useState } from "react";
import { Modal } from "@ui";
import { PlatformIcon } from "./PlatformIcon";

export type CoinOperation = {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
};

type Props = {
  enabled: boolean;
  balance: number;
  operations?: CoinOperation[];
};

export function CoinsBalance({ enabled, balance, operations = [] }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className="student-coins"
        aria-label={`Баланс: ${balance} монет. Открыть историю начислений`}
        onClick={() => setIsOpen(true)}
      >
        <PlatformIcon name="coins" />
        <strong>{balance}</strong>
      </button>
      <Modal isOpen={isOpen} title="История начислений" className="student-coins-drawer" backdropClassName="student-coins-backdrop" onClose={() => setIsOpen(false)}>
        <div className="student-coins-balance"><PlatformIcon name="coins" size={32} /><strong>{balance}</strong><span>Интегралики</span></div>
        {operations.length === 0 ? (
          <p className="student-resource-state">Начислений пока нет.</p>
        ) : (
          <div className="student-data-list">
            {operations.map((operation) => (
              <article key={operation.id} className="student-data-row student-coin-operation">
                <div>
                  <h3>{operation.description}</h3>
                  <time dateTime={operation.createdAt}>{operation.createdAt}</time>
                </div>
                <strong>{operation.amount > 0 ? "+" : ""}{operation.amount}</strong>
              </article>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
