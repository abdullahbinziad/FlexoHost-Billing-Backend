import mongoose, { Schema } from 'mongoose';
import { IRoleDocument } from './role.interface';

const roleSchema = new Schema<IRoleDocument>(
    {
        name: {
            type: String,
            required: [true, 'Role name is required'],
            trim: true,
            maxlength: [100, 'Role name cannot exceed 100 characters'],
        },
        slug: {
            type: String,
            required: [true, 'Role slug is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[a-z0-9_]+$/, 'Slug must be lowercase alphanumeric with underscores'],
        },
        permissions: {
            type: [String],
            default: [],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        isSystem: {
            type: Boolean,
            default: false,
        },
        hasFullAccess: {
            type: Boolean,
            default: false,
        },
        archived: {
            type: Boolean,
            default: false,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
        archivedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

roleSchema.index({ slug: 1 }, { unique: true });
roleSchema.index({ archived: 1 });
roleSchema.index({ archived: 1, slug: 1 }, { unique: true, partialFilterExpression: { archived: false } });

// Generate slug from name if not provided
roleSchema.pre('save', function (next) {
    if (this.isNew && !this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
    }
    next();
});

const Role = mongoose.model<IRoleDocument>('Role', roleSchema);

export default Role;
