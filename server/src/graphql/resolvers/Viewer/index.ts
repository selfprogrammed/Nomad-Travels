import crypto from 'crypto'
import { GoogleAuth } from '../../../lib/api'
import { Database, User, Viewer } from '../../../lib/types'
import { LogInArgs } from './types'

const LogInViaGoogle = async (
  code: string,
  token: string,
  db: Database
): Promise<User | undefined> => {
  const { user } = await GoogleAuth.logIn(code)
  if (!user) {
    throw new Error('Oops! Failed to Login In!')
  }

  const userNamesList = user.names && user.names.length ? user.names : null
  const userEmailsList =
    user.emailAddresses && user.emailAddresses.length
      ? user.emailAddresses
      : null
  const userPhotosList = user.photos && user.photos.length ? user.photos : null

  const userName = userNamesList ? userNamesList[0].displayName : null

  const userId =
    userNamesList &&
    userNamesList[0].metadata &&
    userNamesList[0].metadata.source
      ? userNamesList[0].metadata.source.id
      : null

  const userAvatar =
    userPhotosList && userPhotosList[0].url ? userPhotosList[0].url : null

  const userEmail =
    userEmailsList && userEmailsList[0].value ? userEmailsList[0].value : null

  if (!userName || !userId || !userAvatar || !userEmail) {
    throw new Error('Google Log In failed!')
  }

  const updateExistingViewer = await db.users.findOneAndUpdate(
    {
      _id: userId,
    },
    {
      $set: {
        name: userName,
        email: userEmail,
        avatar: userAvatar,
        token,
      },
    }
  )

  let viewer = updateExistingViewer.value

  if (!viewer) {
    const addNewViewer = await db.users.insertOne({
      _id: userId,
      name: userName,
      email: userEmail,
      avatar: userAvatar,
      token,
      income: 0,
      listings: [],
      bookings: [],
    })

    const newViewerId = addNewViewer.insertedId
    viewer = await db.users.findOne({ _id: newViewerId })
  }
  return viewer
}

export const ViewerResolvers = {
  Query: {
    authUrl: async (): Promise<string> => {
      try {
        return GoogleAuth.authUrl
      } catch (error) {
        throw new Error(`Failed to get Google Auth Url:${error}`)
      }
    },
  },

  Mutation: {
    logIn: async (
      _root: undefined,
      { input }: LogInArgs,
      { db }: { db: Database }
    ): Promise<Viewer> => {
      try {
        const code = input ? input.code : undefined
        const token = crypto.randomBytes(16).toString('hex')
        const viewer: User | undefined = code
          ? await LogInViaGoogle(code, token, db)
          : undefined

        if (!viewer) return { didRequest: true }

        return {
          _id: viewer._id,
          token: viewer.token,
          avatar: viewer.avatar,
          walletId: viewer.walletId,
          didRequest: true,
        }
      } catch (error) {
        throw new Error(`Failed to log in ${error}`)
      }
    },
    logOut: () => {
      try {
        return { didRequest: true }
      } catch (error) {
        throw new Error(`Failed to log out:${error}`)
      }
    },
  },

  Viewer: {
    id: (viewer: Viewer): string | undefined => {
      return viewer._id
    },
    hasWallet: (viewer: Viewer): boolean | undefined => {
      return viewer.walletId ? true : undefined
    },
  },
}