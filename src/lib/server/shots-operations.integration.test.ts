import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  brewingMethods,
  drinkOptionGroups,
  drinkOptionValues,
  drinkTypes,
  recipes,
  shotDrinkOptions,
  shots,
} from '@/db/schema'
import { replaceRecipeDrinkOptions } from '@/lib/server/drink-options.server'
import { saveShotToRecipeInTransaction } from '@/lib/server/shot-recipes.server'
import {
  createShotOperation,
  updateShotOperation,
} from '@/lib/server/shots-operations.server'
import { shotFormValuesFrom } from '@/modules/brews/shot-form-values'

const integrationDescribe = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip
let brewingMethodId: number | undefined

integrationDescribe('brew operations contract', () => {
  beforeAll(async () => {
    const [method] = await db
      .insert(brewingMethods)
      .values({
        name: `contract-method-${crypto.randomUUID()}`,
        enabledParameters: ['doseGrams', 'yieldGrams'],
      })
      .returning({ id: brewingMethods.id })
    brewingMethodId = method?.id
  })

  afterAll(async () => {
    if (!brewingMethodId) return
    await db.delete(shots).where(eq(shots.brewingMethodId, brewingMethodId))
    await db
      .delete(brewingMethods)
      .where(eq(brewingMethods.id, brewingMethodId))
  })

  test('creates and updates a brew atomically through the domain boundary', async () => {
    if (!brewingMethodId)
      throw new Error('Contract brewing method was not created')

    const created = await createShotOperation({
      brewingMethodId,
      doseGrams: '18.0',
      yieldGrams: '36.0',
      brewPressureBar: '9.0',
      notes: 'Initial contract brew',
    })

    expect(created).toMatchObject({
      brewingMethodId,
      doseGrams: '18.00',
      yieldGrams: '36.00',
      brewPressureBar: null,
      notes: 'Initial contract brew',
    })

    const updated = await updateShotOperation({
      id: created.id,
      brewingMethodId,
      doseGrams: '19.0',
      yieldGrams: '38.0',
      notes: 'Updated contract brew',
    })

    expect(updated).toMatchObject({
      id: created.id,
      doseGrams: '19.00',
      yieldGrams: '38.00',
      notes: 'Updated contract brew',
    })
  })

  test('rejects a brew whose brewing method does not exist', async () => {
    await expect(
      createShotOperation({ brewingMethodId: 2_147_483_647 }),
    ).rejects.toThrow('Brewing method not found')
  })
  test('saving a brew as a recipe preserves milk options on create and overwrite', async () => {
    if (!brewingMethodId) throw new Error('Missing contract method')
    const methodId = brewingMethodId
    await db.transaction(async (tx) => {
      const [drink] = await tx
        .insert(drinkTypes)
        .values({ name: `milk-drink-${crypto.randomUUID()}` })
        .returning()
      const [group] = await tx
        .insert(drinkOptionGroups)
        .values({ name: `milk-${crypto.randomUUID()}` })
        .returning()
      if (!drink || !group) throw new Error('Missing drink fixtures')
      const [milk] = await tx
        .insert(drinkOptionValues)
        .values({ groupId: group.id, name: 'Oat' })
        .returning()
      const [brew] = await tx
        .insert(shots)
        .values({ brewingMethodId: methodId, drinkTypeId: drink.id })
        .returning()
      if (!milk || !brew) throw new Error('Missing brew fixtures')
      await tx
        .insert(shotDrinkOptions)
        .values({ shotId: brew.id, optionValueId: milk.id })
      const recipe = await saveShotToRecipeInTransaction(tx, brew.id, {
        name: 'Milk recipe',
      })
      const readRecipe = () =>
        tx.query.recipes.findFirst({
          where: eq(recipes.id, recipe.id),
          with: {
            accessoryGearLinks: true,
            drinkOptions: { with: { optionValue: true } },
          },
        })
      const saved = await readRecipe()
      expect(saved?.drinkTypeId).toBe(drink.id)
      expect(
        saved?.drinkOptions.map(({ optionValue }) => optionValue.name),
      ).toEqual(['Oat'])
      if (!saved) throw new Error('Missing saved recipe')
      expect(
        shotFormValuesFrom({ ...saved, accessoryGearIds: [] })
          .drinkOptionValueIds,
      ).toEqual({ [String(group.id)]: String(milk.id) })
      await replaceRecipeDrinkOptions(tx, recipe.id, [])
      expect((await readRecipe())?.drinkOptions).toEqual([])
      await saveShotToRecipeInTransaction(tx, brew.id, { recipeId: recipe.id })
      expect(
        (await readRecipe())?.drinkOptions.map(
          ({ optionValue }) => optionValue.name,
        ),
      ).toEqual(['Oat'])
      await tx
        .delete(shotDrinkOptions)
        .where(eq(shotDrinkOptions.shotId, brew.id))
      await saveShotToRecipeInTransaction(tx, brew.id, { recipeId: recipe.id })
      expect((await readRecipe())?.drinkOptions).toEqual([])
      await tx.delete(recipes).where(eq(recipes.id, recipe.id))
      await tx.delete(shots).where(eq(shots.id, brew.id))
      await tx
        .delete(drinkOptionValues)
        .where(eq(drinkOptionValues.id, milk.id))
      await tx
        .delete(drinkOptionGroups)
        .where(eq(drinkOptionGroups.id, group.id))
      await tx.delete(drinkTypes).where(eq(drinkTypes.id, drink.id))
    })
  })
})
