// Baraja inglesa de 52 cartas. Valor 2-14 (11=J, 12=Q, 13=K, 14=A); palo S, H, D, C.
export const PALOS = ['S', 'H', 'D', 'C'];

export function nuevaBaraja() {
  const baraja = [];
  for (const p of PALOS) for (let v = 2; v <= 14; v++) baraja.push({ v, p });
  return baraja;
}

// Fisher-Yates
export function barajar(baraja, azar) {
  const copia = [...baraja];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = azar.entero(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
