import mongoose, { Schema } from 'mongoose';

export interface IRegistrarConfigDocument extends mongoose.Document {
    registrarKey: string;
    isActive: boolean;
    settings: Record<string, unknown>;
    updatedBy?: Schema.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const registrarConfigSchema = new Schema<IRegistrarConfigDocument>(
    {
        registrarKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        isActive: {
            type: Boolean,
            default: false,
        },
        settings: {
            type: Schema.Types.Mixed,
            default: {},
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

const RegistrarConfig = mongoose.models.RegistrarConfig
    || mongoose.model<IRegistrarConfigDocument>('RegistrarConfig', registrarConfigSchema);

export default RegistrarConfig;
