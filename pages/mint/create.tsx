"use client";
import Head from "next/head";
import { useEffect } from "react";
import { Address, decodeEventLog, isAddress, maxUint256, parseUnits } from "viem";
import TokenInput from "@components/Input/TokenInput";
import { useTokenData, useUserBalance } from "@hooks";
import { useState } from "react";
import Button from "@components/Button";
import { useAccount, useBlockNumber, useChainId } from "wagmi";
import { erc20Abi } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatBigInt, shortenAddress } from "@utils";
import { toast } from "react-toastify";
import { TxToast, renderErrorTxToast } from "@components/TxToast";
import NormalInput from "@components/Input/NormalInput";
import AddressInput from "@components/Input/AddressInput";
import GuardToAllowedChainBtn from "@components/Guards/GuardToAllowedChainBtn";
import { WAGMI_CHAIN, WAGMI_CONFIG } from "../../app.config";
import { ADDRESS, MintingHubV2ABI } from "@frankencoin/zchf";
import AppTitle from "@components/AppTitle";
import AppLink from "@components/AppLink";
import { useRouter as useNavigation } from "next/navigation";
import { mainnet } from "viem/chains";
import GuardSupportedChain from "@components/Guards/GuardSupportedChain";

export default function PositionCreate({}) {
	const [minCollAmount, setMinCollAmount] = useState(0n);
	const [initialCollAmount, setInitialCollAmount] = useState(0n);
	const [limitAmount, setLimitAmount] = useState(1_000_000n * BigInt(1e18));
	const [proposalFee, setProposalFee] = useState(1000n);
	const [initPeriod, setInitPeriod] = useState(5n);
	const [liqPrice, setLiqPrice] = useState(0n);
	const [interest, setInterest] = useState(30000n);
	const [maturity, setMaturity] = useState(12n);
	const [buffer, setBuffer] = useState(200000n);
	const [auctionDuration, setAuctionDuration] = useState(48n);
	const [collateralAddress, setCollateralAddress] = useState("");
	const [minCollAmountError, setMinCollAmountError] = useState("");
	const [initialCollAmountError, setInitialCollAmountError] = useState("");
	const [collTokenAddrError, setCollTokenAddrError] = useState("");
	const [limitAmountError, setLimitAmountError] = useState("");
	const [interestError, setInterestError] = useState("");
	const [initError, setInitError] = useState("");
	const [liqPriceError, setLiqPriceError] = useState("");
	const [bufferError, setBufferError] = useState("");
	const [durationError, setDurationError] = useState("");
	const [isConfirming, setIsConfirming] = useState("");

	const [userAllowance, setUserAllowance] = useState<bigint>(0n);
	const { data } = useBlockNumber({ watch: true });
	const account = useAccount();
	const navigate = useNavigation();

	const chainId = mainnet.id;
	const collTokenData = useTokenData(collateralAddress);
	const userBalance = useUserBalance();

	useEffect(() => {
		const acc: Address | undefined = account.address;
		if (acc === undefined) return;
		if (isConfirming == "approve") return;
		if (isAddress(collateralAddress) == false) return;

		const fetchAsync = async function () {
			const _allowance = await readContract(WAGMI_CONFIG, {
				address: collateralAddress as Address,
				chainId,
				abi: erc20Abi,
				functionName: "allowance",
				args: [acc, ADDRESS[chainId].mintingHubV2],
			});
			setUserAllowance(_allowance);
		};

		fetchAsync();
	}, [data, account.address, collateralAddress, isConfirming, chainId]);

	useEffect(() => {
		if (isAddress(collateralAddress)) {
			if (collTokenData.name == "NaN") {
				setCollTokenAddrError("Could not obtain token data");
			} else if (collTokenData.decimals > 24n) {
				setCollTokenAddrError("Token decimals should be less than 24.");
			} else {
				setCollTokenAddrError("");
			}
		} else {
			setLiqPriceError("");
			setLimitAmountError("");
			setMinCollAmountError("");
			setInitialCollAmountError("");
			setCollTokenAddrError("");
		}
	}, [collateralAddress, collTokenData]);

	useEffect(() => {
		if (minCollAmount > 0n) {
			const valueBigInt = parseUnits("5000", 36) / minCollAmount;
			setLiqPrice(valueBigInt);
			checkCollateralAmount(minCollAmount, valueBigInt);
		}
	}, [minCollAmount]);

	const onChangeProposalFee = (value: string) => {
		const valueBigInt = BigInt(value);
		setProposalFee(valueBigInt);
	};

	const onChangeMinCollAmount = (value: string) => {
		const valueBigInt = BigInt(value);
		setMinCollAmount(valueBigInt);
		if (valueBigInt > initialCollAmount) {
			setInitialCollAmount(valueBigInt);
			onChangeInitialCollAmount(valueBigInt.toString());
		}
		checkCollateralAmount(valueBigInt, liqPrice);
	};

	const onChangeInitialCollAmount = (value: string) => {
		const valueBigInt = BigInt(value);
		setInitialCollAmount(valueBigInt);
		if (valueBigInt < minCollAmount) {
			setInitialCollAmountError("Must be at least the minimum amount.");
		} else if (valueBigInt > collTokenData.balance) {
			setInitialCollAmountError(`Not enough ${collTokenData.symbol} in your wallet.`);
		} else {
			setInitialCollAmountError("");
		}
	};

	const onChangeLimitAmount = (value: string) => {
		const valueBigInt = BigInt(value);
		setLimitAmount(valueBigInt);
	};

	const onChangeCollateralAddress = (addr: string) => {
		setCollateralAddress(addr);
		setMinCollAmount(0n);
		setInitialCollAmount(0n);
		setLiqPrice(0n);
	};

	const onChangeInterest = (value: string) => {
		const valueBigInt = BigInt(value);
		setInterest(valueBigInt);

		if (valueBigInt > 100_0000n) {
			setInterestError("Annual Interest Rate should be less than 100%");
		} else {
			setInterestError("");
		}
	};

	const onChangeMaturity = (value: string) => {
		const valueBigInt = BigInt(value);
		setMaturity(valueBigInt);
	};

	const onChangeInitPeriod = (value: string) => {
		const valueBigInt = BigInt(value);
		setInitPeriod(valueBigInt);
		if (valueBigInt < 3n) {
			setInitError("Initialization Period must be at least 3 days.");
		} else {
			setInitError("");
		}
	};

	const onChangeLiqPrice = (value: string) => {
		const valueBigInt = BigInt(value);
		setLiqPrice(valueBigInt);
		checkCollateralAmount(minCollAmount, valueBigInt);
	};

	function checkCollateralAmount(coll: bigint, price: bigint) {
		if (coll * price < parseUnits("5000", 36)) {
			setLiqPriceError("The liquidation value of the collateral must be at least 5000 ZCHF");
			setMinCollAmountError("The collateral must be worth at least 5000 ZCHF");
		} else {
			setLiqPriceError("");
			setMinCollAmountError("");
		}
	}

	const onChangeBuffer = (value: string) => {
		const valueBigInt = BigInt(value);
		setBuffer(valueBigInt);
		if (valueBigInt > 1000_000n) {
			setBufferError("Buffer cannot exceed 100%");
		} else if (valueBigInt < 100_000) {
			setBufferError("Buffer must be at least 10%");
		} else {
			setBufferError("");
		}
	};

	const onChangeAuctionDuration = (value: string) => {
		const valueBigInt = BigInt(value);
		setAuctionDuration(valueBigInt);
		if (valueBigInt < 12n) {
			setDurationError("Duration must be at least 12h");
		} else {
			setDurationError("");
		}
	};

	const hasFormError = () => {
		return (
			!!minCollAmountError ||
			!!initialCollAmountError ||
			!!collTokenAddrError ||
			!!limitAmountError ||
			!!interestError ||
			!!liqPriceError ||
			!!bufferError ||
			!!durationError ||
			!!initError
		);
	};

	const handleApprove = async () => {
		try {
			setIsConfirming("approve");

			const approveWriteHash = await writeContract(WAGMI_CONFIG, {
				address: collTokenData.address,
				chainId,
				abi: erc20Abi,
				functionName: "approve",
				args: [ADDRESS[chainId].mintingHubV2, maxUint256],
			});

			const toastContent = [
				{
					title: "Amount: ",
					value: "infinite " + collTokenData.symbol,
				},
				{
					title: "Spender: ",
					value: shortenAddress(ADDRESS[chainId].mintingHubV2),
				},
				{
					title: "Transaction:",
					hash: approveWriteHash,
				},
			];

			await toast.promise(waitForTransactionReceipt(WAGMI_CONFIG, { hash: approveWriteHash, confirmations: 1 }), {
				pending: {
					render: <TxToast title={`Approving ${collTokenData.symbol}`} rows={toastContent} />,
				},
				success: {
					render: <TxToast title={`Successfully Approved ${collTokenData.symbol}`} rows={toastContent} />,
				},
			});
		} catch (error) {
			toast.error(renderErrorTxToast(error));
		} finally {
			setIsConfirming("");
		}
	};

	const handleOpenPosition = async () => {
		try {
			setIsConfirming("open");
			const openWriteHash = await writeContract(WAGMI_CONFIG, {
				address: ADDRESS[chainId].mintingHubV2,
				chainId,
				abi: MintingHubV2ABI,
				functionName: "openPosition",
				args: [
					collTokenData.address,
					minCollAmount,
					initialCollAmount,
					limitAmount,
					parseInt(initPeriod.toString()) * 24 * 60 * 60,
					parseInt(maturity.toString()) * 86400 * 30,
					parseInt(auctionDuration.toString()) * 60 * 60,
					Number(interest),
					liqPrice,
					Number(buffer),
				],
			});

			const toastContent = [
				{
					title: "Collateral",
					value: shortenAddress(collTokenData.address),
				},
				{
					title: "Collateral Amount:",
					value: formatBigInt(initialCollAmount, parseInt(collTokenData.decimals.toString())) + " " + collTokenData.symbol,
				},
				{
					title: "LiqPrice: ",
					value: formatBigInt(liqPrice, 36 - parseInt(collTokenData.decimals.toString())) + " ZCHF",
				},
				{
					title: "Transaction:",
					hash: openWriteHash,
				},
			];

			await toast.promise(waitForTransactionReceipt(WAGMI_CONFIG, { hash: openWriteHash, confirmations: 1 }), {
				pending: {
					render: <TxToast title={`Creating a new position`} rows={toastContent} />,
				},
				success: {
					render: <TxToast title={`Successfully created a position`} rows={toastContent} />,
				},
			});

			const receipt = await waitForTransactionReceipt(WAGMI_CONFIG, {
				chainId,
				hash: openWriteHash,
				confirmations: 1,
			});

			const targetEvents = receipt.logs
				.map((log) => {
					try {
						// Try to decode each log using your ABI
						return decodeEventLog({
							abi: MintingHubV2ABI,
							data: log.data,
							topics: log.topics,
						});
					} catch (error) {
						// If decoding fails, it's not an event from your contract
						return null;
					}
				})
				.filter((event) => event !== null && event.eventName === "PositionOpened");

			if (targetEvents.length > 0) {
				const position = targetEvents[0].args.position;
				navigate.push(`/mypositions/${position}`);
			}
		} catch (error) {
			toast.error(renderErrorTxToast(error));
		} finally {
			setIsConfirming("");
		}
	};

	return (
		<>
			<Head>
				<title>Frankencoin - Propose Position</title>
			</Head>

			<AppTitle title="Propose New Position"></AppTitle>

			<div className="md:mt-8">
				<section className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col gap-y-4">
						<div className="text-lg font-bold justify-center mt-3 flex">Proposal Process</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
							<TokenInput
								label="Proposal Fee"
								symbol="ZCHF"
								value={proposalFee.toString()}
								onChange={onChangeProposalFee}
								digit={0}
								error={userBalance[mainnet.id].frankencoin < BigInt(1000 * 1e18) ? "Not enough ZCHF" : ""}
								disabled={true}
								placeholder="Amount"
							/>
							<NormalInput
								label="Initialization Period"
								symbol="days"
								error={initError}
								digit={0}
								value={initPeriod.toString()}
								onChange={onChangeInitPeriod}
								placeholder="Number"
							/>
						</div>
						<div className="text-text-secondary">
							It is recommended to{" "}
							<AppLink
								label={"discuss"}
								href="https://github.com/Frankencoin-ZCHF/FrankenCoin/discussions"
								external={true}
								className="pr-1"
							/>
							new positions before initiating them to increase the probability of passing the decentralized governance
							process.
						</div>
					</div>

					{/* Collateral */}
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col gap-y-4">
						<div className="text-lg font-bold justify-center mt-3 flex">Collateral</div>

						<AddressInput
							label="Contract Address"
							error={collTokenAddrError}
							placeholder="0x..."
							value={collateralAddress}
							onChange={onChangeCollateralAddress}
							autoFocus={true}
						/>
						{collTokenData.symbol != "NaN" && initialCollAmount > userAllowance ? (
							<Button
								isLoading={isConfirming == "approve"}
								disabled={
									collTokenData.symbol == "NaN" || (userAllowance > minCollAmount && userAllowance > initialCollAmount)
								}
								onClick={() => handleApprove()}
							>
								Approve {collTokenData.symbol == "NaN" ? "" : "Handling of " + collTokenData.symbol}
							</Button>
						) : (
							""
						)}
						<TokenInput
							label="Minimum Collateral"
							symbol={collTokenData.symbol}
							error={minCollAmountError}
							hideMaxLabel
							value={minCollAmount.toString()}
							onChange={onChangeMinCollAmount}
							digit={collTokenData.decimals}
							placeholder="Amount"
						/>
						<TokenInput
							label="Initial Collateral"
							symbol={collTokenData.symbol}
							error={initialCollAmountError}
							// min={minCollAmount}
							// max={collTokenData.balance}
							value={initialCollAmount.toString()}
							onChange={onChangeInitialCollAmount}
							digit={collTokenData.decimals}
							placeholder="Amount"
						/>
					</div>
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col gap-y-4">
						<div className="text-lg font-bold text-center mt-3">Financial Terms</div>
						<TokenInput
							label="Global Minting Limit"
							hideMaxLabel
							symbol="ZCHF"
							error={limitAmountError}
							// min={parseEther("200000")}
							// max={parseEther("10000000")}
							// reset={parseEther("1000000")}
							value={limitAmount.toString()}
							onChange={onChangeLimitAmount}
							placeholder="Amount"
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
							<NormalInput
								label="Risk Premium"
								symbol="%"
								error={interestError}
								digit={4}
								value={interest.toString()}
								onChange={onChangeInterest}
								placeholder="Percent"
							/>
							<NormalInput
								label="Maturity"
								symbol="months"
								digit={0}
								value={maturity.toString()}
								onChange={onChangeMaturity}
								placeholder="Number"
							/>
						</div>
					</div>
					<div className="bg-card-body-primary shadow-lg rounded-xl p-4 flex flex-col gap-y-4">
						<div className="text-lg font-bold text-center mt-3">Liquidation</div>
						<TokenInput
							label="Liquidation Price"
							symbol="ZCHF"
							error={liqPriceError}
							digit={36n - collTokenData.decimals}
							hideMaxLabel={minCollAmount == 0n}
							// min={minCollAmount == 0n ? 0n : (5000n * 10n ** 36n + minCollAmount - 1n) / minCollAmount / 2n}
							// max={minCollAmount == 0n ? 0n : (5000n * 15n * 10n ** 36n + minCollAmount - 1n) / minCollAmount / 10n}
							// reset={minCollAmount == 0n ? 0n : (5000n * 10n ** 36n + minCollAmount - 1n) / minCollAmount}
							value={liqPrice.toString()}
							onChange={onChangeLiqPrice}
							placeholder="Price"
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
							<NormalInput
								label="Retained Reserve"
								symbol="%"
								error={bufferError}
								digit={4}
								value={buffer.toString()}
								onChange={onChangeBuffer}
								placeholder="Percent"
							/>
							<NormalInput
								label="Auction Duration"
								symbol="hours"
								error={durationError}
								digit={0}
								value={auctionDuration.toString()}
								onChange={onChangeAuctionDuration}
								placeholder="Number"
							/>
						</div>
					</div>
				</section>
				<div className="mx-auto mt-8 w-72 max-w-full flex-col">
					<GuardSupportedChain chain={mainnet}>
						<Button
							disabled={minCollAmount == 0n || userAllowance < initialCollAmount || initialCollAmount == 0n || hasFormError()}
							isLoading={isConfirming == "open"}
							onClick={() => handleOpenPosition()}
						>
							Propose Position
						</Button>
					</GuardSupportedChain>
				</div>
			</div>
		</>
	);
}
