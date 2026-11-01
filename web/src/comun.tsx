import { useCallback, useEffect, useState } from "react";

// Carga datos al abrir una pantalla y maneja los estados de espera y error en un solo lugar.
export function useDatos<T>(cargar: () => Promise<T>, dependencias: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(() => {
    setError(null);
    return cargar()
      .then(setDatos)
      .catch((e: Error) => setError(e.message));
  }, dependencias);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { datos, error, recargar };
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: React.ReactNode }) {
  return <p className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>{children}</p>;
}

export function Estado({ valor }: { valor: string }) {
  return <span className={`estado estado-${valor}`}>{valor}</span>;
}
