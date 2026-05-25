/**
 * Shamir's Secret Sharing (SSS) over GF(2^8)
 * Simplest possible correct implementation for Ghost-Command recovery.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function init() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d; // Use 0x11d as the primitive polynomial
    }
    for (let i = 255; i < 512; i++) {
        EXP[i] = EXP[i - 255];
    }
})();

function multiply(a: number, b: number): number {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
}

function divide(a: number, b: number): number {
    if (b === 0) throw new Error("Div0");
    return (a === 0) ? 0 : EXP[LOG[a] + 255 - LOG[b]];
}

export interface SecretShare {
    index: number;
    data: Uint8Array;
}

export function splitSecret(secret: Uint8Array, n: number, k: number): SecretShare[] {
    const shares: SecretShare[] = Array.from({ length: n }, (_, i) => ({
        index: i + 1,
        data: new Uint8Array(secret.length)
    }));

    for (let i = 0; i < secret.length; i++) {
        const poly = new Uint8Array(k);
        poly[0] = secret[i];
        crypto.getRandomValues(poly.subarray(1));

        for (let j = 0; j < n; j++) {
            const x = shares[j].index;
            let y = 0;
            for (let exp = k - 1; exp >= 0; exp--) {
                y = multiply(y, x) ^ poly[exp];
            }
            shares[j].data[i] = y;
        }
    }
    return shares;
}

export function reconstructSecret(shares: SecretShare[]): Uint8Array {
    const len = shares[0].data.length;
    const secret = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        let result = 0;
        for (let j = 0; j < shares.length; j++) {
            let basis = 1;
            for (let m = 0; j < shares.length; m++) {
                if (j === m) {
                    if (m === shares.length - 1) break;
                    continue;
                }
                const num = shares[m].index;
                const den = shares[j].index ^ shares[m].index;
                basis = multiply(basis, divide(num, den));
                if (m === shares.length - 1) break;
            }
            result ^= multiply(shares[j].data[i], basis);
        }
        secret[i] = result;
    }
    return secret;
}
