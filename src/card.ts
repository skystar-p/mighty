import Random = require('random-js');

export const enum CardSuit {
    Spade = 's',
    Club = 'c',
    Diamond = 'd',
    Heart = 'h',
    Joker = 'jk'
}

export const enum CardRank {
    Two = '2',
    Three = '3',
    Four = '4',
    Five = '5',
    Six = '6',
    Seven = '7',
    Eight = '8',
    Nine = '9',
    Ten = '0',
    Jack = 'J',
    Queen = 'Q',
    King = 'K',
    Ace = 'A'
}

export const enum Giruda {
    Spade = 's',
    Club = 'c',
    Diamond = 'd',
    Heart = 'h',
    None = ''
}

export class Card {
    private static readonly suitTable = "scdh";
    private static readonly idxTable = "234567890JQKA";
    static fromNumber(n: number): Card | null {
        if (n >= 53) return null;

        const suit = n / 13 | 0;
        const idx = n % 13;
        if (suit === 4) return Card.fromCardCode('jk');
        return Card.fromCardCode(Card.suitTable[suit] + Card.idxTable[idx]);
    }
    private static parseSuit(suit: string): CardSuit | null {
        switch (suit) {
            case 's': return CardSuit.Spade;
            case 'c': return CardSuit.Club;
            case 'd': return CardSuit.Diamond;
            case 'h': return CardSuit.Heart;
            default: return null;
        }
    }
    private static parseRank(rank: string): CardRank | null {
        switch (rank) {
            case '2': return CardRank.Two;
            case '3': return CardRank.Three;
            case '4': return CardRank.Four;
            case '5': return CardRank.Five;
            case '6': return CardRank.Six;
            case '7': return CardRank.Seven;
            case '8': return CardRank.Eight;
            case '9': return CardRank.Nine;
            case '0': return CardRank.Ten;
            case 'J': return CardRank.Jack;
            case 'Q': return CardRank.Queen;
            case 'K': return CardRank.King;
            case 'A': return CardRank.Ace;
            default: return null;
        }
    }
    static fromCardCode(card: string): Card | null {
        if (card.length !== 2) {
            return null;
        }
        if (card === "jk") {
            return new Card(CardSuit.Joker, null);
        }
        const suit = Card.parseSuit(card[0]);
        const rank = Card.parseRank(card[1]);
        if (suit === null || rank === null) {
            return null;
        }
        return new Card(suit, rank);
    }
    get dealPoint(): number {
        if (this.rank === CardRank.Ace && this.suit === CardSuit.Spade) return 0;
        if (this.suit === CardSuit.Joker) return -1;
        switch (this.rank) {
            case CardRank.Ten:
            case CardRank.Jack:
            case CardRank.Queen:
            case CardRank.King:
            case CardRank.Ace:
                return 1;
            default:
                return 0;
        }
    }

    get point(): number {
        switch (this.rank) {
            case CardRank.Ten:
            case CardRank.Jack:
            case CardRank.Queen:
            case CardRank.King:
            case CardRank.Ace:
                return 1;
            default:
                return 0;
        }
    }

    readonly suit: CardSuit;
    readonly rank: CardRank | null;
    constructor(suit: CardSuit, rank: CardRank | null) {
        this.suit = suit;
        this.rank = rank;
    }
    toString(): string {
        if (this.suit == CardSuit.Joker) {
            return 'jk';
        }
        return this.suit + this.rank;
    }
}

function sampleFromRange(mt: Random.MT19937, l: number, r: number): number {
    const distance = r - l;
    if (distance <= 1) return l;
    const bound = ((2 ** 31) / distance | 0) * distance;
    while (true) {
        const sample = mt();
        const norm = sample < 0 ? ~sample : sample;
        if (norm < bound) {
            return norm % distance + l;
        }
    }
}

function shuffle<T>(mt: Random.MT19937, list: T[]): T[] {
    let n = list.length;
    const ret = [];
    const chk = new Array(n).fill(false);
    function findNext(current = -1) {
        while (chk[++current]);
        return current;
    }
    while (n) {
        let sample = sampleFromRange(mt, 0, n);
        let c = findNext();
        while (sample--) c = findNext(c);
        ret.push(list[c]);
        chk[c] = true;
        n--;
    }
    return ret;
}

export function shuffleCard(): Card[][] {
    const mt = Random.engines.mt19937();
    mt.autoSeed();
    const hands: Card[][] = [];
    let left = shuffle(mt, [...new Array(53).keys()].map(Card.fromNumber));
    for (let i = 0; i < 5; i++) {
        hands.push(left.slice(0, 10));
        left = left.slice(10);
    }
    return hands.concat(left);
}
