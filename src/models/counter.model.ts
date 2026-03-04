import mongoose, { Schema } from 'mongoose';

const counterSchema = new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Atomically increment and return the next sequence number for a given entity.
 * Uses MongoDB's findOneAndUpdate with $inc — guaranteed no duplicates
 * even under heavy concurrent load.
 *
 * @param name - The entity name (e.g. 'invoice', 'order', 'service', 'client')
 * @returns The next sequence number (1, 2, 3, ...)
 */
export async function getNextSequence(name: string): Promise<number> {
    const counter = await Counter.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter!.seq;
}

/**
 * Format a sequence number with a prefix and zero-padding.
 *
 * @param prefix - e.g. 'INV', 'ORD', 'SVC'
 * @param seq - the sequence number
 * @param padLength - total digit length (default 6)
 * @returns e.g. 'INV-000001'
 */
export function formatSequenceId(prefix: string, seq: number, padLength = 6): string {
    return `${prefix}-${String(seq).padStart(padLength, '0')}`;
}

export default Counter;
