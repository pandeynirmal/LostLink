import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import bcrypt from 'bcryptjs';
import validator from "validator";
import { createCustodialWallet, fundWallet } from "@/lib/wallet";



export async function POST(req: Request) {
    try {
        const { fullName, email, password, organization } = await req.json();
        if (!validator.isEmail(email)) {
    return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 }
    );
}
const domain = email.split("@")[1];

const allowedDomains = ["gmail.com", "yahoo.com", "outlook.com"];

if (!allowedDomains.includes(domain.toLowerCase())) {
    return NextResponse.json(
        { message: "Unsupported email domain" },
        { status: 400 }
    );
}




        if (!fullName || !email || !password || !organization) {
            return NextResponse.json(
                { message: 'Missing required fields' },
                { status: 400 }
            );
        }

        await dbConnect();

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return NextResponse.json(
                { message: 'User already exists' },
                { status: 400 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        const walletData = await createCustodialWallet();

        // Create user
        const user = await User.create({
            fullName,
            email,
            password: hashedPassword,
            organization,
            ...walletData,
        });

        await fundWallet(walletData.walletAddress);

        return NextResponse.json(
            { message: 'User registered successfully', userId: user._id },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { message: 'Internal server error', error: error.message },
            { status: 500 }
        );
    }
}
