import { githubAPI } from '$api';
import type { Request } from '@sveltejs/kit';
import mongoose from 'mongoose';
import User from '$models/User';
import Settings from '$models/Settings';
import cuid from 'cuid';
import jwt from 'jsonwebtoken';

export async function get(request: Request) {
	const code = request.query.get('code');
	const { GITHUB_APP_CLIENT_SECRET, JWT_SIGN_KEY } = process.env;
	try {
		let uid = cuid();
		const { access_token } = await (
			await fetch(
				`https://github.com/login/oauth/access_token?client_id=${
					import.meta.env.VITE_GITHUB_APP_CLIENTID
				}&client_secret=${GITHUB_APP_CLIENT_SECRET}&code=${code}`,
				{ headers: { accept: 'application/json' } }
			)
		).json();
		const { avatar_url, id } = await (await githubAPI(request, '/user', access_token)).body;
		const email = (await githubAPI(request, '/user/emails', access_token)).body.filter(
			(e) => e.primary
		)[0].email;
		const settings = await Settings.findOne({ applicationName: 'coolify' });
		const registeredUsers = await User.find().countDocuments();
		const foundUser = await User.findOne({ email });
		if (foundUser) {
			await User.findOneAndUpdate({ email }, { avatar: avatar_url }, { upsert: true, new: true });
			uid = foundUser.uid;
		} else {
			if (registeredUsers === 0) {
				const newUser = new User({
					_id: new mongoose.Types.ObjectId(),
					email,
					avatar: avatar_url,
					uid
				});
				const defaultSettings = new Settings({
					_id: new mongoose.Types.ObjectId()
				});
				try {
					await newUser.save();
					await defaultSettings.save();
				} catch (e) {
					console.log(e);
					return {
						status: 500,
						body: e
					};
				}
			} else {
				if (!settings && registeredUsers > 0) {
					return {
						status: 500,
						body: {
							error:'Registration disabled, enable it in settings.'
						}
					};
				} else {
					if (!settings.allowRegistration) {
						return {
							status: 500,
							body: {
								error: 'You are not allowed here!'
							}
						};
					} else {
						const newUser = new User({
							_id: new mongoose.Types.ObjectId(),
							email,
							avatar: avatar_url,
							uid
						});
						try {
							await newUser.save();
						} catch (e) {
							console.log(e);
							return {
								status: 500,
								body: {
									error: e
								}
							};
						}
					}
				}
			}
		}
		const coolToken = jwt.sign({}, JWT_SIGN_KEY, {
			expiresIn: 15778800,
			algorithm: 'HS256',
			audience: 'coolLabs',
			issuer: 'coolLabs',
			jwtid: uid,
			subject: `User:${uid}`,
			notBefore: -1000
		});
		return {
			status: 302,
			headers: {
				'set-cookie': [
					`coolToken=${coolToken}; Path=/; HttpOnly`,
					`ghToken=${access_token}; Path=/; HttpOnly`
				],
				location: `/bye?coolToken=${coolToken}&ghToken=${access_token}`
			},
			body: {}
		};
	} catch (error) {
		console.log('error happened');
		console.log(error);
		return { status: 500, body: { ...error } };
	}
	// return api(request, '/todos/1')
}
