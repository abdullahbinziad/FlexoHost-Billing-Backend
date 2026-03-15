import mongoose, { Schema } from 'mongoose';

export interface IWhmcsIdMapping extends mongoose.Document {
    entity: string;  // 'client' | 'user' | 'product' | 'order' | 'invoice' | 'service' | 'server' | 'tld'
    whmcsId: number | string;
    flexohostId: mongoose.Types.ObjectId | string;
}

const schema = new Schema<IWhmcsIdMapping>(
    {
        entity: { type: String, required: true, index: true },
        whmcsId: { type: Schema.Types.Mixed, required: true },
        flexohostId: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: true }
);

schema.index({ entity: 1, whmcsId: 1 }, { unique: true });

export const WhmcsIdMapping = mongoose.model<IWhmcsIdMapping>('WhmcsIdMapping', schema);

export async function getFlexohostId(entity: string, whmcsId: number | string): Promise<mongoose.Types.ObjectId | null> {
    const doc = await WhmcsIdMapping.findOne({ entity, whmcsId }).lean();
    if (!doc?.flexohostId) return null;
    return new mongoose.Types.ObjectId(String(doc.flexohostId));
}

export async function setMapping(entity: string, whmcsId: number | string, flexohostId: mongoose.Types.ObjectId | string): Promise<void> {
    await WhmcsIdMapping.findOneAndUpdate(
        { entity, whmcsId },
        { $set: { entity, whmcsId, flexohostId: String(flexohostId) } },
        { upsert: true }
    );
}
