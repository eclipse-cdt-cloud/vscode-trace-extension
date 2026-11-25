import { csvEscape } from '../xy-output-component-utils';

describe('csvEscape', () => {
    it('returns an empty string for null and undefined', () => {
        expect(csvEscape(null)).toBe('');
        expect(csvEscape(undefined)).toBe('');
    });

    it('leaves plain text untouched', () => {
        expect(csvEscape('hello')).toBe('hello');
        expect(csvEscape('a|b')).toBe('a|b');
    });

    it('quotes values containing commas, quotes, LF and CR', () => {
        expect(csvEscape('a,b')).toBe('"a,b"');
        expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
        expect(csvEscape('a\nb')).toBe('"a\nb"');
        expect(csvEscape('a\rb')).toBe('"a\rb"');
        expect(csvEscape('A\n|B')).toBe('"A\n|B"');
    });

    it('does not prefix plain numeric values', () => {
        expect(csvEscape('-42')).toBe('-42');
        expect(csvEscape('+42')).toBe('+42');
        expect(csvEscape('-3.14')).toBe('-3.14');
        expect(csvEscape('-1e-3')).toBe('-1e-3');
        expect(csvEscape('-1,234.5')).toBe('"-1,234.5"');
        expect(csvEscape('-.5')).toBe('-.5');
        expect(csvEscape('-1.')).toBe('-1.');
    });

    it('prefixes exponent-only values that have no mantissa digit', () => {
        expect(csvEscape('+E1')).toBe("'+E1");
        expect(csvEscape('-e3')).toBe("'-e3");
        expect(csvEscape('-.')).toBe("'-.");
    });

    it('prefixes values that start with a line feed', () => {
        expect(csvEscape('\n=1+1')).toBe('"\'\n=1+1"');
    });

    it('accepts number and bigint values', () => {
        expect(csvEscape(0)).toBe('0');
        expect(csvEscape(-5)).toBe('-5');
        expect(csvEscape(1e21)).toBe('1e+21');
        expect(csvEscape(BigInt('-9007199254740993'))).toBe('-9007199254740993');
    });

    it('prefixes formula triggers with an apostrophe', () => {
        expect(csvEscape('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
        expect(csvEscape('+cmd')).toBe("'+cmd");
        expect(csvEscape('-1+cmd')).toBe("'-1+cmd");
        expect(csvEscape('@foo')).toBe("'@foo");
        expect(csvEscape('-')).toBe("'-");
        expect(csvEscape('\tx')).toBe("'\tx");
    });

    it('prefixes and quotes when both apply', () => {
        expect(csvEscape('=a,b')).toBe('"\'=a,b"');
        expect(csvEscape('\rx')).toBe('"\'\rx"');
    });
});
